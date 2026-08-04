import asyncio
import io
from typing import ClassVar

import av
import redis as redis_sync
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.services.tts import cancel_key, output_path, stream_key, tts_service

STREAM_TTL_SECONDS = 3600

# Forces the Matroska/WebM muxer to flush a cluster roughly every 250ms
# instead of buffering a large chunk before writing anything — needed so
# audio reaches the Redis Stream (and the listening client) with low latency.
_MUX_OPTIONS = {"live": "1", "cluster_time_limit": "250", "cluster_size_limit": "4096"}


class _RelayIO(io.RawIOBase):
    """Destination for everything PyAV's muxer writes: persisted to the final
    file on disk and, in the same pass, relayed to the Redis Stream so a
    listening client hears it as it's produced."""

    def __init__(self, file_obj, redis_client: "redis_sync.Redis", s_key: str) -> None:
        self._file = file_obj
        self._redis = redis_client
        self._s_key = s_key

    def writable(self) -> bool:
        return True

    def write(self, data) -> int:
        chunk = bytes(data)
        self._file.write(chunk)
        self._redis.xadd(self._s_key, {"data": chunk})
        return len(chunk)


def _synthesize_and_publish(job_id: str, text: str, voice_reference: str) -> str:
    """Runs synchronously in a worker thread: encodes the generated audio to
    Opus/WebM, writing it to the final file on disk and to a Redis Stream in
    the same pass, so the API can relay it to a listening client in real
    time. Checks for a cancellation flag between chunks so a page reload/
    explicit cancel stops generation early (at worst finishing the sentence
    currently in progress)."""
    settings = get_settings()
    client = redis_sync.Redis.from_url(settings.redis_url)
    s_key = stream_key(job_id)
    c_key = cancel_key(job_id)
    webm_path = output_path(job_id)

    try:
        model = tts_service.model
        model_state = model.get_state_for_audio_prompt(voice_reference, truncate=True)
        audio_chunks = model.generate_audio_stream(model_state=model_state, text_to_generate=text)

        cancelled = False
        samples_written = 0
        with open(webm_path, "wb") as f:
            container = av.open(_RelayIO(f, client, s_key), mode="w", format="webm", options=_MUX_OPTIONS)
            stream = container.add_stream("libopus", rate=model.sample_rate)
            stream.layout = "mono"

            for chunk in audio_chunks:
                if client.exists(c_key):
                    cancelled = True
                    break
                pcm = chunk.clamp(-1, 1).float().cpu().numpy().reshape(1, -1)
                frame = av.AudioFrame.from_ndarray(pcm, format="fltp", layout="mono")
                frame.sample_rate = model.sample_rate
                frame.pts = samples_written
                samples_written += pcm.shape[1]
                for packet in stream.encode(frame):
                    container.mux(packet)

            for packet in stream.encode(None):
                container.mux(packet)
            container.close()

        client.xadd(s_key, {"event": "cancelled" if cancelled else "done"})
        client.expire(s_key, STREAM_TTL_SECONDS)
        return str(webm_path)
    except Exception as exc:
        client.xadd(s_key, {"event": "error", "message": str(exc)})
        client.expire(s_key, STREAM_TTL_SECONDS)
        raise
    finally:
        client.delete(c_key)
        client.close()


async def synthesize_task(ctx: dict, text: str, voice_reference: str) -> str:
    job_id = ctx["job_id"]
    return await asyncio.to_thread(_synthesize_and_publish, job_id, text, voice_reference)


async def on_startup(ctx: dict) -> None:
    tts_service.load()


class WorkerSettings:
    functions: ClassVar = [synthesize_task]
    on_startup = on_startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
