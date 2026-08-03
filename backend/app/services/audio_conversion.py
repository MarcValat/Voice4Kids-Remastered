import io
from pathlib import Path

import av

from app.services.tts import SAMPLE_RATE

MAX_RECORDING_BYTES = 20 * 1024 * 1024  # 20 MB


class ConversionError(ValueError):
    pass


def convert_to_wav(content: bytes, output_path: Path) -> None:
    """Decode an arbitrary browser-recorded audio blob (webm/opus, ogg, mp4...)
    and write it as a 16-bit mono PCM WAV file, readable by pocket_tts."""
    if not content:
        raise ConversionError("Fichier audio vide.")
    if len(content) > MAX_RECORDING_BYTES:
        raise ConversionError("Enregistrement trop volumineux (20 Mo max).")

    try:
        input_container = av.open(io.BytesIO(content))
    except av.error.FFmpegError as exc:
        raise ConversionError("Format audio non reconnu.") from exc

    try:
        output_container = av.open(str(output_path), mode="w", format="wav")
        output_stream = output_container.add_stream("pcm_s16le", rate=SAMPLE_RATE)
        output_stream.layout = "mono"

        resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)

        for frame in input_container.decode(audio=0):
            for resampled_frame in resampler.resample(frame):
                for packet in output_stream.encode(resampled_frame):
                    output_container.mux(packet)

        for packet in output_stream.encode(None):
            output_container.mux(packet)

        output_container.close()
    except (av.error.FFmpegError, IndexError) as exc:
        raise ConversionError("Impossible de convertir l'audio enregistré.") from exc
    finally:
        input_container.close()
