import logging
import os
from pathlib import Path
from uuid import uuid4

from pocket_tts import TTSModel
from pocket_tts.data.audio import stream_audio_chunks

from app.core.config import get_settings

logger = logging.getLogger(__name__)

LANGUAGE = "french_24l"
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
OUTPUT_DIR = DATA_DIR / "outputs"
VOICES_DIR = DATA_DIR / "voices"

# Curated subset of Kyutai's predefined voices with a French-language embedding.
PRESET_VOICES = {
    "estelle": "estelle",
}


class TTSService:
    def __init__(self) -> None:
        self._model: TTSModel | None = None

    def load(self) -> None:
        settings = get_settings()
        if settings.hf_token:
            os.environ.setdefault("HF_TOKEN", settings.hf_token)

        logger.info("Loading Kyutai Pocket TTS model (%s)...", LANGUAGE)
        self._model = TTSModel.load_model(language=LANGUAGE)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        VOICES_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(
            "TTS model loaded (voice cloning %s).",
            "enabled" if self._model.has_voice_cloning else "disabled — no valid HF_TOKEN",
        )

    @property
    def model(self) -> TTSModel:
        if self._model is None:
            raise RuntimeError("TTS model is not loaded yet")
        return self._model

    @property
    def voice_cloning_enabled(self) -> bool:
        return self.model.has_voice_cloning

    def synthesize(self, text: str, voice_reference: str | Path) -> Path:
        model_state = self.model.get_state_for_audio_prompt(voice_reference, truncate=True)
        audio_chunks = self.model.generate_audio_stream(
            model_state=model_state, text_to_generate=text
        )

        output_path = OUTPUT_DIR / f"{uuid4()}.wav"
        stream_audio_chunks(str(output_path), audio_chunks, self.model.config.mimi.sample_rate)
        return output_path


tts_service = TTSService()
