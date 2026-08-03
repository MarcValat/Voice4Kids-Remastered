from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile

from app.services.audio_conversion import ConversionError, convert_to_wav
from app.services.tts import PRESET_VOICES, VOICES_DIR, tts_service

router = APIRouter(prefix="/api", tags=["voices"])


@router.get("/voices")
def list_voices() -> dict[str, object]:
    return {
        "presets": list(PRESET_VOICES.keys()),
        "cloning_enabled": tts_service.voice_cloning_enabled,
    }


@router.post("/voices/clone")
async def clone_voice(audio: UploadFile) -> dict[str, str]:
    if not tts_service.voice_cloning_enabled:
        raise HTTPException(
            status_code=403,
            detail="Le clonage de voix n'est pas disponible (HF_TOKEN manquant ou non autorisé).",
        )

    content = await audio.read()
    voice_id = uuid4()
    output_path = VOICES_DIR / f"{voice_id}.wav"

    try:
        convert_to_wav(content, output_path)
    except ConversionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"voice_id": str(voice_id)}
