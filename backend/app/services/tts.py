import logging
import os
from pathlib import Path

from pocket_tts import TTSModel

from app.core.config import get_settings

logger = logging.getLogger(__name__)

LANGUAGE = "french_24l"
SAMPLE_RATE = 24000  # matches french_24l.yaml's mimi.sample_rate

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_DIR = DATA_DIR / "outputs"
VOICES_DIR = DATA_DIR / "voices"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
VOICES_DIR.mkdir(parents=True, exist_ok=True)

# Curated subset of Kyutai's predefined voices with a French-language embedding.
PRESET_VOICES = {
    "estelle": "estelle",
}


def stream_key(job_id: str) -> str:
    return f"synthesis-stream:{job_id}"


def cancel_key(job_id: str) -> str:
    return f"cancel:{job_id}"


class TTSService:
    """Loads and holds the TTS model. Only used by the arq worker process —
    the API process enqueues jobs and never loads the (large, slow) model itself."""

    def __init__(self) -> None:
        self._model: TTSModel | None = None

    def load(self) -> None:
        settings = get_settings()
        if settings.hf_token:
            os.environ.setdefault("HF_TOKEN", settings.hf_token)

        logger.info("Loading Kyutai Pocket TTS model (%s)...", LANGUAGE)
        self._model = TTSModel.load_model(language=LANGUAGE)
        logger.info(
            "TTS model loaded (voice cloning %s).",
            "enabled" if self._model.has_voice_cloning else "disabled — no valid HF_TOKEN",
        )

    @property
    def model(self) -> TTSModel:
        if self._model is None:
            raise RuntimeError("TTS model is not loaded yet")
        return self._model


tts_service = TTSService()
