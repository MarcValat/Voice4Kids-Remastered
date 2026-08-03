import pytest

from app.services.tts import (
    UnknownVoicePresetError,
    VoiceSampleNotFoundError,
    cancel_key,
    output_path,
    resolve_voice_reference,
    stream_key,
)


def test_resolve_voice_reference_known_preset():
    assert resolve_voice_reference("estelle", None) == "estelle"


def test_resolve_voice_reference_unknown_preset():
    with pytest.raises(UnknownVoicePresetError):
        resolve_voice_reference("not-a-real-voice", None)


def test_resolve_voice_reference_missing_sample():
    with pytest.raises(VoiceSampleNotFoundError):
        resolve_voice_reference(None, "00000000-0000-0000-0000-000000000000")


def test_resolve_voice_reference_existing_sample(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.tts.VOICES_DIR", tmp_path)
    sample_path = tmp_path / "my-voice.wav"
    sample_path.write_bytes(b"fake wav content")

    assert resolve_voice_reference(None, "my-voice") == str(sample_path)


def test_stream_key_and_cancel_key_are_distinct_and_stable():
    assert stream_key("job-1") == stream_key("job-1")
    assert stream_key("job-1") != cancel_key("job-1")


def test_output_path_uses_webm_extension():
    assert output_path("job-1").suffix == ".webm"
