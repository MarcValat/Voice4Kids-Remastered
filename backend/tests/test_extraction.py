import pytest

from app.services.extraction import MAX_FILE_SIZE_BYTES, ExtractionError, extract_text
from tests.conftest import make_minimal_docx, make_minimal_pdf


def test_extract_text_pdf():
    assert "Bonjour" in extract_text("story.pdf", make_minimal_pdf("Bonjour"))


def test_extract_text_docx():
    assert "Bonjour" in extract_text("story.docx", make_minimal_docx("Bonjour"))


def test_extract_text_rejects_unsupported_extension():
    with pytest.raises(ExtractionError):
        extract_text("story.txt", b"hello")


def test_extract_text_rejects_oversized_file():
    content = b"%PDF-" + b"0" * MAX_FILE_SIZE_BYTES
    with pytest.raises(ExtractionError):
        extract_text("story.pdf", content)


def test_extract_text_rejects_content_extension_mismatch():
    docx_bytes = make_minimal_docx("Bonjour")
    with pytest.raises(ExtractionError):
        extract_text("story.pdf", docx_bytes)
