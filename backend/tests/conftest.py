import wave
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.main import app


@pytest.fixture(autouse=True)
def _disable_rate_limiting():
    # Endpoint tests exercise routes many times across the suite; real rate
    # limiting would make them order-dependent and flaky. Rate limiting
    # itself isn't covered by this suite.
    app.state.limiter.enabled = False


@pytest.fixture
def client():
    # Not used as a context manager on purpose: that would run the app's
    # lifespan (real Redis connection). Tests mock Redis access per-route
    # instead, so no external services are required to run the suite.
    return TestClient(app)


def make_minimal_pdf(text: str = "Bonjour") -> bytes:
    """A hand-built, spec-valid single-page PDF containing real extractable
    text — pypdf's own writer has no simple API for drawing text."""
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 200 200]/Contents 5 0 R>>",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
        b"<</Length 44>>\nstream\nBT /F1 24 Tf 20 100 Td (%s) Tj ET\nendstream" % text.encode(),
    ]
    header = b"%PDF-1.1\n"
    body = b""
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(header) + len(body))
        body += f"{i} 0 obj".encode() + obj + b"endobj\n"

    xref_offset = len(header) + len(body)
    xref = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        xref += f"{offset:010d} 00000 n \n".encode()
    trailer = f"trailer<</Size {len(objects) + 1}/Root 1 0 R>>\nstartxref\n{xref_offset}\n%%EOF".encode()

    return header + body + xref + trailer


def make_blank_pdf() -> bytes:
    """A valid PDF with a page but no text content."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = BytesIO()
    writer.write(buf)
    return buf.getvalue()


def make_minimal_docx(text: str = "Bonjour") -> bytes:
    from docx import Document

    document = Document()
    document.add_paragraph(text)
    buf = BytesIO()
    document.save(buf)
    return buf.getvalue()


def make_tiny_wav(seconds: float = 0.2, rate: int = 8000) -> bytes:
    buf = BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(rate * seconds))
    return buf.getvalue()
