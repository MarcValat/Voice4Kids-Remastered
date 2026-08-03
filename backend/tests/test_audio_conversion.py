import wave

import pytest

from app.services.audio_conversion import (
    MAX_RECORDING_BYTES,
    ConversionError,
    convert_to_wav,
)
from app.services.tts import SAMPLE_RATE
from tests.conftest import make_tiny_wav


def test_convert_to_wav_resamples_to_target_rate(tmp_path):
    output_path = tmp_path / "out.wav"

    convert_to_wav(make_tiny_wav(seconds=0.2, rate=8000), output_path)

    assert output_path.is_file()
    with wave.open(str(output_path), "rb") as w:
        assert w.getframerate() == SAMPLE_RATE
        assert w.getnchannels() == 1


def test_convert_to_wav_rejects_empty(tmp_path):
    with pytest.raises(ConversionError):
        convert_to_wav(b"", tmp_path / "out.wav")


def test_convert_to_wav_rejects_oversized(tmp_path):
    content = b"0" * (MAX_RECORDING_BYTES + 1)
    with pytest.raises(ConversionError):
        convert_to_wav(content, tmp_path / "out.wav")


def test_convert_to_wav_rejects_unrecognized_format(tmp_path):
    with pytest.raises(ConversionError):
        convert_to_wav(b"this is not audio data", tmp_path / "out.wav")
