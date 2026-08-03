import asyncio
import wave
from typing import ClassVar

import redis as redis_sync
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.services.tts import (
    AUDIO_CHANNELS,
    AUDIO_SAMPLE_WIDTH_BYTES,
    cancel_key,
    output_path,
    stream_key,
    tts_service,
)

STREAM_TTL_SECONDS = 3600

# Chunks are batched into ~250ms of audio per Redis XADD, instead of one XADD
# per model-decoded chunk (~80ms) — cuts round-trips ~3x with no perceptible
# effect on streaming latency for the listener.
BATCH_FLUSH_BYTES = int(24000 * AUDIO_SAMPLE_WIDTH_BYTES * 0.25)


def _synthesize_and_publish(job_id: str, text: str, voice_reference: str) -> str:
    """Runs synchronously in a worker thread: generates audio, writes the final
    WAV file to disk, and publishes it in batches to a Redis Stream as it's
    produced so the API can relay it to the client in real time. Checks for a
    cancellation flag between chunks so a page reload/explicit cancel stops
    generation early (at worst finishing the sentence currently in progress)."""
    settings = get_settings()
    client = redis_sync.Redis.from_url(settings.redis_url)
    s_key = stream_key(job_id)
    c_key = cancel_key(job_id)
    wav_path = output_path(job_id)

    try:
        model = tts_service.model
        model_state = model.get_state_for_audio_prompt(voice_reference, truncate=True)
        audio_chunks = model.generate_audio_stream(model_state=model_state, text_to_generate=text)

        cancelled = False
        buffer = bytearray()
        with wave.open(str(wav_path), "wb") as wav_file:
            wav_file.setnchannels(AUDIO_CHANNELS)
            wav_file.setsampwidth(AUDIO_SAMPLE_WIDTH_BYTES)
            wav_file.setframerate(model.sample_rate)

            for chunk in audio_chunks:
                if client.exists(c_key):
                    cancelled = True
                    break
                pcm_bytes = (chunk.clamp(-1, 1) * 32767).short().numpy().tobytes()
                wav_file.writeframes(pcm_bytes)
                buffer.extend(pcm_bytes)
                if len(buffer) >= BATCH_FLUSH_BYTES:
                    client.xadd(s_key, {"data": bytes(buffer)})
                    buffer.clear()

        if buffer:
            client.xadd(s_key, {"data": bytes(buffer)})

        client.xadd(s_key, {"event": "cancelled" if cancelled else "done"})
        client.expire(s_key, STREAM_TTL_SECONDS)
        return str(wav_path)
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
