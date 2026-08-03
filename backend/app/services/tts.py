import logging
from pathlib import Path
from uuid import uuid4

from pocket_tts import TTSModel
from pocket_tts.data.audio import stream_audio_chunks

logger = logging.getLogger(__name__)

LANGUAGE = "french_24l"
OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "outputs"

# Curated subset of Kyutai's predefined voices with a French-language embedding.
PRESET_VOICES = {
    "estelle": "estelle",
}


class TTSService:
    def __init__(self) -> None:
        self._model: TTSModel | None = None

    def load(self) -> None:
        logger.info("Loading Kyutai Pocket TTS model (%s)...", LANGUAGE)
        self._model = TTSModel.load_model(language=LANGUAGE)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        logger.info("TTS model loaded.")

    @property
    def model(self) -> TTSModel:
        if self._model is None:
            raise RuntimeError("TTS model is not loaded yet")
        return self._model

    def synthesize(self, text: str, voice: str) -> Path:
        if voice not in PRESET_VOICES:
            raise ValueError(f"Unknown voice preset: {voice}")

        model_state = self.model.get_state_for_audio_prompt(PRESET_VOICES[voice])
        audio_chunks = self.model.generate_audio_stream(
            model_state=model_state, text_to_generate=text
        )

        output_path = OUTPUT_DIR / f"{uuid4()}.wav"
        stream_audio_chunks(str(output_path), audio_chunks, self.model.config.mimi.sample_rate)
        return output_path


tts_service = TTSService()
