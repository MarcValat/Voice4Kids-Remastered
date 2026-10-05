import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request, Response, UploadFile

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
    except Exception as exc:
        # Untrusted input: any unexpected decoder failure should still reach
        # the user as a readable error rather than a bare 500.
        logger.exception("Unexpected error converting voice sample %r", audio.filename)
        output_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Impossible de lire ce fichier audio.") from exc

    logger.info("Voice sample cloned: %s", voice_id)
    return {"voice_id": str(voice_id)}


@router.delete("/voices/{voice_id}", status_code=204)
@limiter.limit("30/minute")
def delete_voice(request: Request, voice_id: UUID) -> Response:
    # Idempotent: a voice already gone still counts as deleted, so the client
    # can clean up entries whose file was removed server-side.
    (VOICES_DIR / f"{voice_id}.wav").unlink(missing_ok=True)
    logger.info("Voice sample deleted: %s", voice_id)
    return Response(status_code=204)
