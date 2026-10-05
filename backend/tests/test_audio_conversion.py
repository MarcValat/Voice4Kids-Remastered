import wave

import av
import numpy as np
import pytest

from app.services.audio_conversion import (
    MAX_RECORDING_BYTES,
    ConversionError,
    convert_for_download,
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


def _write_tiny_webm(path, seconds=0.5):
    with av.open(str(path), mode="w", format="webm") as container:
        stream = container.add_stream("libopus", rate=SAMPLE_RATE)
        stream.layout = "mono"
        pcm = np.zeros((1, int(SAMPLE_RATE * seconds)), dtype=np.float32)
        frame = av.AudioFrame.from_ndarray(pcm, format="fltp", layout="mono")
        frame.sample_rate = SAMPLE_RATE
        for packet in stream.encode(frame):
            container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)


@pytest.mark.parametrize(
    ("export_format", "container_name"),
    [("mp3", "mp3"), ("m4a", "mov,mp4,m4a,3gp,3g2,mj2"), ("wav", "wav")],
)
def test_convert_for_download_produces_playable_file(tmp_path, export_format, container_name):
    webm_path = tmp_path / "job.webm"
    output_path = tmp_path / f"job.{export_format}"
    _write_tiny_webm(webm_path)

    convert_for_download(webm_path, output_path, export_format)

    with av.open(str(output_path)) as container:
        assert container.format.name == container_name
        assert sum(frame.samples for frame in container.decode(audio=0)) > 0
    assert list(tmp_path.glob("*.tmp")) == []


def test_convert_for_download_rejects_invalid_input(tmp_path):
    bad_path = tmp_path / "job.webm"
    bad_path.write_bytes(b"not audio")

    with pytest.raises(ConversionError):
        convert_for_download(bad_path, tmp_path / "job.mp3", "mp3")
    assert not (tmp_path / "job.mp3").exists()
