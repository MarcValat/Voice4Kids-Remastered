import logging
import struct
from collections.abc import AsyncIterator
from typing import Self
from uuid import UUID

from arq.jobs import Job, JobStatus
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, model_validator

from app.core.limiter import limiter
from app.services.queue import get_redis_pool
from app.services.tts import (
    OUTPUT_DIR,
    PRESET_VOICES,
    SAMPLE_RATE,
    VOICES_DIR,
    cancel_key,
    stream_key,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["tts"])


class SynthesizeRequest(BaseModel):
    text: str
    voice: str | None = None
    voice_sample_id: UUID | None = None

    @model_validator(mode="after")
    def check_exactly_one_voice_reference(self) -> Self:
        if bool(self.voice) == bool(self.voice_sample_id):
            raise ValueError("Provide exactly one of 'voice' or 'voice_sample_id'.")
        return self


def _resolve_voice_reference(payload: SynthesizeRequest) -> str:
    if payload.voice_sample_id is not None:
        voice_path = VOICES_DIR / f"{payload.voice_sample_id}.wav"
        if not voice_path.is_file():
            raise HTTPException(status_code=404, detail="Échantillon de voix introuvable.")
        return str(voice_path)

    if payload.voice not in PRESET_VOICES:
        raise HTTPException(status_code=400, detail=f"Unknown voice preset: {payload.voice}")
    return PRESET_VOICES[payload.voice]


@router.post("/synthesize", status_code=202)
@limiter.limit("10/minute")
async def synthesize(request: Request, payload: SynthesizeRequest) -> dict[str, str]:
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    voice_reference = _resolve_voice_reference(payload)

    pool = await get_redis_pool()
    job = await pool.enqueue_job("synthesize_task", payload.text, voice_reference)
    if job is None:
        raise HTTPException(status_code=500, detail="Impossible de lancer la génération.")
    logger.info("Enqueued synthesis job %s (%d chars)", job.job_id, len(payload.text))
    return {"job_id": job.job_id}


@router.post("/synthesize/{job_id}/cancel")
async def cancel_synthesis(job_id: str) -> dict[str, str]:
    pool = await get_redis_pool()
    job = Job(job_id, pool)
    status = await job.status()
    if status == JobStatus.not_found:
        raise HTTPException(status_code=404, detail="Job introuvable.")

    await pool.set(cancel_key(job_id), "1", ex=3600)
    logger.info("Cancellation requested for job %s", job_id)
    return {"status": "cancelling"}


@router.get("/synthesize/{job_id}/status")
async def synthesis_status(job_id: str) -> dict[str, str]:
    pool = await get_redis_pool()
    job = Job(job_id, pool)
    status = await job.status()

    if status == JobStatus.not_found:
        raise HTTPException(status_code=404, detail="Job introuvable.")

    if status != JobStatus.complete:
        return {"status": status.value}

    info = await job.result_info()
    if info is None or not info.success:
        message = str(info.result) if info else "Erreur inconnue."
        logger.warning("Job %s failed: %s", job_id, message)
        return {"status": "error", "error": message}

    last_event = await pool.xrevrange(stream_key(job_id), count=1)
    if last_event:
        _, fields = last_event[0]
        if fields.get(b"event") == b"cancelled":
            return {"status": "cancelled"}
        if fields.get(b"event") == b"error":
            return {"status": "error", "error": (fields.get(b"message") or b"").decode()}

    return {"status": "complete", "audio_url": f"/api/synthesize/{job_id}/audio"}


@router.get("/synthesize/{job_id}/audio")
def synthesis_audio(job_id: str) -> FileResponse:
    path = OUTPUT_DIR / f"{job_id}.wav"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio introuvable.")
    return FileResponse(path, media_type="audio/wav", filename=path.name)


def _wav_streaming_header(sample_rate: int, num_channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """A canonical WAV header with a placeholder (max) data size, for a stream
    whose final length isn't known upfront. Tolerated by browsers, same trick
    Kyutai's own pocket-tts server uses for its streaming endpoint."""
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = 0x7FFFFFFF - 44
    riff_size = data_size + 36
    return (
        b"RIFF"
        + struct.pack("<I", riff_size)
        + b"WAVE"
        + b"fmt "
        + struct.pack("<IHHIIHH", 16, 1, num_channels, sample_rate, byte_rate, block_align, bits_per_sample)
        + b"data"
        + struct.pack("<I", data_size)
    )


@router.get("/synthesize/{job_id}/stream")
async def synthesis_stream(job_id: str) -> StreamingResponse:
    pool = await get_redis_pool()
    s_key = stream_key(job_id)

    async def generate() -> AsyncIterator[bytes]:
        yield _wav_streaming_header(SAMPLE_RATE)

        last_id = "0"
        while True:
            entries = await pool.xread({s_key: last_id}, block=5000, count=10)
            if not entries:
                continue

            for _, messages in entries:
                for message_id, fields in messages:
                    last_id = message_id
                    if b"event" in fields:
                        return
                    data = fields.get(b"data")
                    if data:
                        yield data

    return StreamingResponse(generate(), media_type="audio/wav")
