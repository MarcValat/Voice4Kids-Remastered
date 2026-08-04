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
