from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, model_validator
from typing_extensions import Self

from app.services.tts import PRESET_VOICES, VOICES_DIR, tts_service

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


@router.post("/synthesize")
def synthesize(request: SynthesizeRequest) -> FileResponse:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    voice_reference: str | Path
    if request.voice_sample_id is not None:
        voice_path = VOICES_DIR / f"{request.voice_sample_id}.wav"
        if not voice_path.is_file():
            raise HTTPException(status_code=404, detail="Échantillon de voix introuvable.")
        voice_reference = voice_path
    else:
        if request.voice not in PRESET_VOICES:
            raise HTTPException(status_code=400, detail=f"Unknown voice preset: {request.voice}")
        voice_reference = PRESET_VOICES[request.voice]

    try:
        output_path = tts_service.synthesize(request.text, voice_reference)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return FileResponse(output_path, media_type="audio/wav", filename=output_path.name)
