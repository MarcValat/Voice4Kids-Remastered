import av
import numpy as np
import pytest

from app.services.audio_effects import VoiceEffects

RATE = 24000


def _sine_frames(freq=220.0, seconds=1.0, frame_size=1920):
    t = np.arange(int(RATE * seconds)) / RATE
    signal = (0.3 * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    frames = []
    for start in range(0, len(signal), frame_size):
        frame = av.AudioFrame.from_ndarray(
            signal[start : start + frame_size].reshape(1, -1), format="fltp", layout="mono"
        )
        frame.sample_rate = RATE
        frame.pts = start
        frames.append(frame)
    return frames


def _run(effects, frames):
    out = []
    for frame in frames:
        out.extend(effects.process(frame))
    out.extend(effects.flush())
    return np.concatenate([f.to_ndarray().reshape(-1) for f in out]), out


def _dominant_freq(samples):
    spectrum = np.abs(np.fft.rfft(samples))
    return np.fft.rfftfreq(len(samples), 1 / RATE)[spectrum.argmax()]


def test_defaults_pass_frames_through_untouched():
    effects = VoiceEffects(RATE)
    frames = _sine_frames()

    assert not effects.enabled
    assert effects.process(frames[0]) == [frames[0]]
    assert effects.flush() == []


@pytest.mark.parametrize("speed", [0.7, 1.3])
def test_speed_changes_duration_but_not_pitch(speed):
    samples, out = _run(VoiceEffects(RATE, speed=speed), _sine_frames())

    assert len(samples) / RATE == pytest.approx(1.0 / speed, rel=0.05)
    assert _dominant_freq(samples) == pytest.approx(220, rel=0.03)
    assert all(f.sample_rate == RATE and f.format.name == "fltp" for f in out)


@pytest.mark.parametrize("semitones", [-3, 3])
def test_pitch_changes_frequency_but_not_duration(semitones):
    samples, out = _run(VoiceEffects(RATE, pitch_semitones=semitones), _sine_frames())

    assert len(samples) / RATE == pytest.approx(1.0, rel=0.05)
    assert _dominant_freq(samples) == pytest.approx(220 * 2 ** (semitones / 12), rel=0.03)
    assert all(f.sample_rate == RATE and f.format.name == "fltp" for f in out)
