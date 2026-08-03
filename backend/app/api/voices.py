import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, UploadFile

from app.core.config import get_settings
from app.core.limiter import limiter
from app.services.audio_conversion import ConversionError, convert_to_wav
from app.services.tts import PRESET_VOICES, VOICES_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["voices"])


@router.get("/voices")
def list_voices() -> dict[str, object]:
    return {
        "presets": [
            {"id": name, "label": name.replace("_", " ").title()} for name in PRESET_VOICES
        ],
        "cloning_enabled": get_settings().hf_token is not None,
    }


@router.post("/voices/clone")
@limiter.limit("10/minute")
async def clone_voice(request: Request, audio: UploadFile) -> dict[str, str]:
    if get_settings().hf_token is None:
        raise HTTPException(
            status_code=403,
            detail="Le clonage de voix n'est pas disponible (HF_TOKEN manquant).",
        )

    content = await audio.read()
    voice_id = uuid4()
    output_path = VOICES_DIR / f"{voice_id}.wav"

    try:
        convert_to_wav(content, output_path)
    except ConversionError as exc:
        logger.warning("Rejected voice sample upload: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    logger.info("Voice sample cloned: %s", voice_id)
    return {"voice_id": str(voice_id)}
