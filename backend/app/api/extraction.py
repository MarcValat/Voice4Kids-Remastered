import logging

from fastapi import APIRouter, HTTPException, Request, UploadFile

from app.core.limiter import limiter
from app.services.extraction import ExtractionError, extract_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["extraction"])


@router.post("/extract")
@limiter.limit("20/minute")
async def extract(request: Request, file: UploadFile) -> dict[str, str]:
    content = await file.read()

    try:
        text = extract_text(file.filename or "", content)
    except ExtractionError as exc:
        logger.warning("Rejected upload %r: %s", file.filename, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Aucun texte détecté dans le document.")

    return {"text": text}
