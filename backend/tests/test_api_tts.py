from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from arq.jobs import JobStatus

from app.services.tts import cancel_key, stream_key


class _FakeJob:
    def __init__(self, status, result_info=None):
        self._status = status
        self._result_info = result_info

    async def status(self):
        return self._status

    async def result_info(self):
        return self._result_info


def _job_factory(status, result_info=None):
    def factory(job_id, pool):
        return _FakeJob(status, result_info)

    return factory


@pytest.fixture
def fake_pool(monkeypatch):
    pool = MagicMock()
    pool.enqueue_job = AsyncMock()
    pool.set = AsyncMock()
    pool.xrevrange = AsyncMock(return_value=[])
    pool.xread = AsyncMock(return_value=[])

    async def _get_pool():
        return pool

    monkeypatch.setattr("app.api.tts.get_redis_pool", _get_pool)
    return pool


def test_synthesize_enqueues_job(client, fake_pool):
    fake_pool.enqueue_job.return_value = SimpleNamespace(job_id="abc123")

    response = client.post("/api/synthesize", json={"text": "Bonjour", "voice": "estelle"})

    assert response.status_code == 202
    assert response.json() == {"job_id": "abc123"}


def test_synthesize_passes_default_settings(client, fake_pool):
    fake_pool.enqueue_job.return_value = SimpleNamespace(job_id="abc123")

    client.post("/api/synthesize", json={"text": "Bonjour", "voice": "estelle"})

    settings = fake_pool.enqueue_job.call_args.args[3]
    assert settings == {"precision": 1, "expressiveness": 0.7, "speed": 1.0, "pitch": 0.0}


def test_synthesize_passes_custom_settings(client, fake_pool):
    fake_pool.enqueue_job.return_value = SimpleNamespace(job_id="abc123")
    custom = {"precision": 4, "expressiveness": 0.9, "speed": 0.8, "pitch": -2.0}

    client.post("/api/synthesize", json={"text": "Bonjour", "voice": "estelle", "settings": custom})

    assert fake_pool.enqueue_job.call_args.args[3] == custom


@pytest.mark.parametrize(
    "bad_settings",
    [{"precision": 0}, {"precision": 20}, {"expressiveness": 3}, {"speed": 5}, {"pitch": -12}],
)
def test_synthesize_rejects_out_of_range_settings(client, fake_pool, bad_settings):
    response = client.post(
        "/api/synthesize", json={"text": "Bonjour", "voice": "estelle", "settings": bad_settings}
    )

    assert response.status_code == 422


def test_synthesize_returns_500_when_queue_full(client, fake_pool):
    fake_pool.enqueue_job.return_value = None

    response = client.post("/api/synthesize", json={"text": "Bonjour", "voice": "estelle"})

    assert response.status_code == 500


def test_synthesize_requires_exactly_one_voice_reference(client):
    response = client.post(
        "/api/synthesize",
        json={"text": "Bonjour", "voice": "estelle", "voice_sample_id": "00000000-0000-0000-0000-000000000000"},
    )

    assert response.status_code == 422


def test_synthesize_rejects_empty_text(client):
    response = client.post("/api/synthesize", json={"text": "   ", "voice": "estelle"})

    assert response.status_code == 400


def test_synthesize_rejects_unknown_voice(client):
    response = client.post("/api/synthesize", json={"text": "Bonjour", "voice": "not-a-real-voice"})

    assert response.status_code == 400


def test_cancel_synthesis(client, fake_pool, monkeypatch):
    monkeypatch.setattr("app.api.tts.Job", _job_factory(JobStatus.in_progress))

    response = client.post("/api/synthesize/job-1/cancel")

    assert response.status_code == 200
    assert response.json() == {"status": "cancelling"}
    fake_pool.set.assert_awaited_once_with(cancel_key("job-1"), "1", ex=3600)


def test_cancel_synthesis_unknown_job(client, fake_pool, monkeypatch):
    monkeypatch.setattr("app.api.tts.Job", _job_factory(JobStatus.not_found))

    response = client.post("/api/synthesize/job-1/cancel")

    assert response.status_code == 404


def test_status_pending(client, fake_pool, monkeypatch):
    monkeypatch.setattr("app.api.tts.Job", _job_factory(JobStatus.in_progress))

    response = client.get("/api/synthesize/job-1/status")

    assert response.status_code == 200
    assert response.json() == {"status": "in_progress"}


def test_status_unknown_job(client, fake_pool, monkeypatch):
    monkeypatch.setattr("app.api.tts.Job", _job_factory(JobStatus.not_found))

    response = client.get("/api/synthesize/job-1/status")

    assert response.status_code == 404


def test_status_complete(client, fake_pool, monkeypatch):
    monkeypatch.setattr(
        "app.api.tts.Job",
        _job_factory(JobStatus.complete, SimpleNamespace(success=True, result="/path/to.webm")),
    )

    response = client.get("/api/synthesize/job-1/status")

    assert response.status_code == 200
    assert response.json() == {"status": "complete", "audio_url": "/api/synthesize/job-1/audio"}


def test_status_complete_but_cancelled(client, fake_pool, monkeypatch):
    monkeypatch.setattr(
        "app.api.tts.Job",
        _job_factory(JobStatus.complete, SimpleNamespace(success=True, result=None)),
    )
    fake_pool.xrevrange.return_value = [(b"1-1", {b"event": b"cancelled"})]

    response = client.get("/api/synthesize/job-1/status")

    assert response.json() == {"status": "cancelled"}


def test_status_complete_but_generation_errored(client, fake_pool, monkeypatch):
    monkeypatch.setattr(
        "app.api.tts.Job",
        _job_factory(JobStatus.complete, SimpleNamespace(success=True, result=None)),
    )
    fake_pool.xrevrange.return_value = [(b"1-1", {b"event": b"error", b"message": b"boom"})]

    response = client.get("/api/synthesize/job-1/status")

    assert response.json() == {"status": "error", "error": "boom"}


def test_status_job_raised_exception(client, fake_pool, monkeypatch):
    monkeypatch.setattr(
        "app.api.tts.Job",
        _job_factory(JobStatus.complete, SimpleNamespace(success=False, result=RuntimeError("kaboom"))),
    )

    response = client.get("/api/synthesize/job-1/status")

    assert response.json() == {"status": "error", "error": "kaboom"}


def test_audio_endpoint_not_found(client):
    response = client.get("/api/synthesize/nonexistent-job/audio")

    assert response.status_code == 404


def test_audio_endpoint_serves_file(client, monkeypatch, tmp_path):
    audio_path = tmp_path / "job-1.webm"
    audio_path.write_bytes(b"fake webm content")
    monkeypatch.setattr("app.api.tts.output_path", lambda job_id: audio_path)

    response = client.get("/api/synthesize/job-1/audio")

    assert response.status_code == 200
    assert response.content == b"fake webm content"
    assert response.headers["content-type"] == "audio/webm"


@pytest.mark.parametrize(
    ("export_format", "media_type"),
    [("mp3", "audio/mpeg"), ("m4a", "audio/mp4"), ("wav", "audio/wav")],
)
def test_audio_endpoint_converts_once(client, monkeypatch, tmp_path, export_format, media_type):
    audio_path = tmp_path / "job-1.webm"
    audio_path.write_bytes(b"fake webm content")
    monkeypatch.setattr("app.api.tts.output_path", lambda job_id: audio_path)
    calls = []

    def fake_convert(src, dst, fmt):
        calls.append((src, fmt))
        dst.write_bytes(b"converted content")

    monkeypatch.setattr("app.api.tts.convert_for_download", fake_convert)

    first = client.get(f"/api/synthesize/job-1/audio?format={export_format}")
    second = client.get(f"/api/synthesize/job-1/audio?format={export_format}")

    assert first.status_code == 200
    assert first.content == b"converted content"
    assert first.headers["content-type"].startswith(media_type)
    assert second.content == b"converted content"
    assert calls == [(audio_path, export_format)]


def test_audio_endpoint_rejects_unknown_format(client, monkeypatch, tmp_path):
    audio_path = tmp_path / "job-1.webm"
    audio_path.write_bytes(b"fake webm content")
    monkeypatch.setattr("app.api.tts.output_path", lambda job_id: audio_path)

    response = client.get("/api/synthesize/job-1/audio?format=flac")

    assert response.status_code == 422


def test_stream_endpoint_relays_chunks_until_done(client, fake_pool):
    s_key = stream_key("job-1")
    fake_pool.xread.side_effect = [
        [(s_key.encode(), [(b"1-1", {b"data": b"chunk1"})])],
        [(s_key.encode(), [(b"2-1", {b"data": b"chunk2"})])],
        [(s_key.encode(), [(b"3-1", {b"event": b"done"})])],
    ]

    response = client.get("/api/synthesize/job-1/stream")

    assert response.status_code == 200
    assert response.content == b"chunk1chunk2"
