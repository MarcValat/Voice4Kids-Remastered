from tests.conftest import make_blank_pdf, make_minimal_pdf


def test_extract_endpoint_returns_text(client):
    files = {"file": ("story.pdf", make_minimal_pdf("Bonjour"), "application/pdf")}
    response = client.post("/api/extract", files=files)

    assert response.status_code == 200
    assert "Bonjour" in response.json()["text"]


def test_extract_endpoint_rejects_unsupported_extension(client):
    files = {"file": ("story.txt", b"hello", "text/plain")}
    response = client.post("/api/extract", files=files)

    assert response.status_code == 400


def test_extract_endpoint_rejects_textless_document(client):
    files = {"file": ("story.pdf", make_blank_pdf(), "application/pdf")}
    response = client.post("/api/extract", files=files)

    assert response.status_code == 400
