from io import BytesIO
from pathlib import Path

from docx import Document
from pypdf import PdfReader

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

_MAGIC_BYTES = {
    ".pdf": b"%PDF-",
    ".docx": b"PK\x03\x04",
}


class ExtractionError(ValueError):
    pass


def _validate_upload(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in _MAGIC_BYTES:
        raise ExtractionError("Format non supporté (PDF ou DOCX uniquement).")
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise ExtractionError("Fichier trop volumineux (10 Mo max).")
    if not content.startswith(_MAGIC_BYTES[suffix]):
        raise ExtractionError("Le contenu du fichier ne correspond pas à son extension.")
    return suffix


def extract_text(filename: str, content: bytes) -> str:
    suffix = _validate_upload(filename, content)
    buffer = BytesIO(content)

    if suffix == ".pdf":
        reader = PdfReader(buffer)
        return "".join(page.extract_text() or "" for page in reader.pages)

    document = Document(buffer)
    return "\n".join(paragraph.text for paragraph in document.paragraphs)
