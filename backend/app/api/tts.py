from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services.tts import PRESET_VOICES, tts_service

router = APIRouter(prefix="/api", tags=["tts"])


class SynthesizeRequest(BaseModel):
    text: str
    voice: str


@router.get("/voices")
def list_voices() -> list[str]:
    return list(PRESET_VOICES.keys())


@router.post("/synthesize")
def synthesize(request: SynthesizeRequest) -> FileResponse:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        output_path = tts_service.synthesize(request.text, request.voice)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return FileResponse(output_path, media_type="audio/wav", filename=output_path.name)
