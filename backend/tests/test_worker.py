from unittest.mock import MagicMock

import av
import torch

from app import worker
from app.services.tts import VoiceSettings


class _FakeModel:
    sample_rate = 24000

    def __init__(self):
        self.temp = 0.7
        self.lsd_decode_steps = 1
        self.used = {}

    def get_state_for_audio_prompt(self, voice_reference, truncate):
        return {}

    def generate_audio_stream(self, model_state, text_to_generate):
        self.used = {"temp": self.temp, "lsd_decode_steps": self.lsd_decode_steps}
        for _ in range(5):
            yield torch.zeros(1920)


def _run(monkeypatch, tmp_path, voice_settings):
    shared_model = _FakeModel()
    monkeypatch.setattr(worker.tts_service, "_model", shared_model)
    monkeypatch.setattr(worker, "output_path", lambda job_id: tmp_path / f"{job_id}.webm")

    client = MagicMock()
    client.exists.return_value = False
    monkeypatch.setattr(worker.redis_sync.Redis, "from_url", lambda url: client)

    copies = []
    original = worker._model_with_settings

    def tracking(settings):
        model = original(settings)
        copies.append(model)
        return model

    monkeypatch.setattr(worker, "_model_with_settings", tracking)

    path = worker._synthesize_and_publish("job-1", "Bonjour", "estelle", voice_settings)
    return shared_model, copies[0], client, path


def test_synthesis_applies_voice_settings_to_a_copy_of_the_model(monkeypatch, tmp_path):
    settings = VoiceSettings(precision=4, expressiveness=0.9, speed=0.8, pitch=2)

    shared_model, job_model, client, path = _run(monkeypatch, tmp_path, settings)

    assert job_model.used == {"temp": 0.9, "lsd_decode_steps": 4}
    assert (shared_model.temp, shared_model.lsd_decode_steps) == (0.7, 1)
    client.xadd.assert_called_with("synthesis-stream:job-1", {"event": "done"})
    with av.open(path) as container:
        duration = sum(f.samples for f in container.decode(audio=0)) / 48000
    # 5 x 1920 samples = 0.4s at 24kHz, slowed down by speed 0.8 -> ~0.5s
    assert 0.45 < duration < 0.6


def test_synthesis_with_default_settings(monkeypatch, tmp_path):
    _, job_model, client, _ = _run(monkeypatch, tmp_path, VoiceSettings())

    assert job_model.used == {"temp": 0.7, "lsd_decode_steps": 1}
    client.xadd.assert_called_with("synthesis-stream:job-1", {"event": "done"})
