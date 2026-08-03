from fastapi import APIRouter, HTTPException, UploadFile

from app.services.extraction import ExtractionError, extract_text

router = APIRouter(prefix="/api", tags=["extraction"])


@router.post("/extract")
async def extract(file: UploadFile) -> dict[str, str]:
    content = await file.read()

    try:
        text = extract_text(file.filename or "", content)
    except ExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Aucun texte détecté dans le document.")

    return {"text": text}
