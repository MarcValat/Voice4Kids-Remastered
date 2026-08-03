import logging
import os
from pathlib import Path

import torch
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

# All of Kyutai's predefined voices confirmed to have a French-language
# embedding (checked via huggingface_hub.list_repo_files on
# kyutai/pocket-tts-without-voice-cloning, languages/french_24l/embeddings/).
_FRENCH_PRESET_VOICE_NAMES = [
    "estelle",
    "cosette",
    "marius",
    "javert",
    "fantine",
    "eponine",
    "azelma",
    "alba",
    "jean",
    "anna",
    "vera",
    "charles",
    "paul",
    "george",
    "mary",
    "jane",
    "michael",
    "eve",
    "bill_boerst",
    "peter_yearsley",
    "stuart_bell",
    "caro_davy",
    "giovanni",
    "lola",
    "juergen",
    "rafael",
]
PRESET_VOICES = {name: name for name in _FRENCH_PRESET_VOICE_NAMES}


class VoiceReferenceError(ValueError):
    """Base for voice reference resolution errors."""


class VoiceSampleNotFoundError(VoiceReferenceError):
    pass


class UnknownVoicePresetError(VoiceReferenceError):
    pass


def stream_key(job_id: str) -> str:
    return f"synthesis-stream:{job_id}"


def cancel_key(job_id: str) -> str:
    return f"cancel:{job_id}"


def output_path(job_id: str) -> Path:
    return OUTPUT_DIR / f"{job_id}.webm"


def resolve_voice_reference(voice: str | None, voice_sample_id: str | None) -> str:
    """Resolve a synthesis request's preset name or cloned-voice id to what
    TTSModel.get_state_for_audio_prompt() expects: either a preset key string
    or a path to a WAV file."""
    if voice_sample_id is not None:
        voice_path = VOICES_DIR / f"{voice_sample_id}.wav"
        if not voice_path.is_file():
            raise VoiceSampleNotFoundError("Échantillon de voix introuvable.")
        return str(voice_path)

    if voice not in PRESET_VOICES:
        raise UnknownVoicePresetError(f"Unknown voice preset: {voice}")
    return PRESET_VOICES[voice]


class TTSService:
    """Loads and holds the TTS model. Only used by the arq worker process —
    the API process enqueues jobs and never loads the (large, slow) model itself."""

    def __init__(self) -> None:
        self._model: TTSModel | None = None

    def load(self) -> None:
        settings = get_settings()
        if settings.hf_token:
            os.environ.setdefault("HF_TOKEN", settings.hf_token)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading Kyutai Pocket TTS model (%s) on %s...", LANGUAGE, device)
        # int8 dynamic quantization of the attention/FFN layers only helps on
        # CPU (~27% faster, no measurable quality impact per the model's own
        # docs) — skip it on GPU, which is faster anyway, and quantized CPU
        # kernels aren't usable on CUDA.
        self._model = TTSModel.load_model(language=LANGUAGE, quantize=(device == "cpu"))
        self._model.to(device)
        logger.info(
            "TTS model loaded on %s (voice cloning %s).",
            device,
            "enabled" if self._model.has_voice_cloning else "disabled — no valid HF_TOKEN",
        )

    @property
    def model(self) -> TTSModel:
        if self._model is None:
            raise RuntimeError("TTS model is not loaded yet")
        return self._model


tts_service = TTSService()
