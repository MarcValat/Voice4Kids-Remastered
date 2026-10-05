from dataclasses import dataclass

from tests.conftest import make_tiny_wav


@dataclass
class _FakeSettings:
    hf_token: str | None


def test_list_voices(client):
    response = client.get("/api/voices")

    assert response.status_code == 200
    data = response.json()
    assert {"id": "estelle", "label": "Estelle"} in data["presets"]
    assert isinstance(data["cloning_enabled"], bool)


def test_clone_voice_requires_hf_token(client, monkeypatch):
    monkeypatch.setattr("app.api.voices.get_settings", lambda: _FakeSettings(hf_token=None))

    files = {"audio": ("recording.wav", make_tiny_wav(), "audio/wav")}
    response = client.post("/api/voices/clone", files=files)

    assert response.status_code == 403


def test_clone_voice_success(client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.voices.get_settings", lambda: _FakeSettings(hf_token="fake-token"))
    monkeypatch.setattr("app.api.voices.VOICES_DIR", tmp_path)

    files = {"audio": ("recording.wav", make_tiny_wav(), "audio/wav")}
    response = client.post("/api/voices/clone", files=files)

    assert response.status_code == 200
    voice_id = response.json()["voice_id"]
    assert (tmp_path / f"{voice_id}.wav").is_file()


def test_clone_voice_rejects_unrecognized_audio(client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.voices.get_settings", lambda: _FakeSettings(hf_token="fake-token"))
    monkeypatch.setattr("app.api.voices.VOICES_DIR", tmp_path)

    files = {"audio": ("recording.wav", b"not audio data", "audio/wav")}
    response = client.post("/api/voices/clone", files=files)

    assert response.status_code == 400


def test_delete_voice_removes_file(client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.voices.VOICES_DIR", tmp_path)
    voice_id = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"
    (tmp_path / f"{voice_id}.wav").write_bytes(make_tiny_wav())

    response = client.delete(f"/api/voices/{voice_id}")

    assert response.status_code == 204
    assert not (tmp_path / f"{voice_id}.wav").exists()


def test_delete_voice_is_idempotent(client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.voices.VOICES_DIR", tmp_path)

    response = client.delete("/api/voices/1b4e28ba-2fa1-11d2-883f-0016d3cca427")

    assert response.status_code == 204


def test_delete_voice_rejects_non_uuid(client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.voices.VOICES_DIR", tmp_path)

    response = client.delete("/api/voices/..%2F..%2Fsecret")

    assert response.status_code in (404, 422)


def test_clone_voice_reports_unexpected_decoder_errors(client, monkeypatch, tmp_path):
    monkeypatch.setattr("app.api.voices.get_settings", lambda: _FakeSettings(hf_token="fake-token"))
    monkeypatch.setattr("app.api.voices.VOICES_DIR", tmp_path)

    def broken_convert(content, output_path):
        raise RuntimeError("decoder exploded")

    monkeypatch.setattr("app.api.voices.convert_to_wav", broken_convert)

    files = {"audio": ("song.mp3", b"whatever", "audio/mpeg")}
    response = client.post("/api/voices/clone", files=files)

    assert response.status_code == 400
    assert response.json()["detail"] == "Impossible de lire ce fichier audio."


def test_oversized_request_error_is_readable_cross_origin(client):
    from app.core.config import get_settings
    from app.core.middleware import MAX_BODY_SIZE_BYTES

    origin = get_settings().frontend_origin
    response = client.post(
        "/api/voices/clone",
        headers={"Origin": origin, "Content-Length": str(MAX_BODY_SIZE_BYTES + 1)},
        content=b"",
    )

    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == origin
