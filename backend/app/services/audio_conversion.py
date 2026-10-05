import io
from pathlib import Path
from uuid import uuid4

import av

from app.services.tts import SAMPLE_RATE

MAX_RECORDING_BYTES = 20 * 1024 * 1024  # 20 MB


class ConversionError(ValueError):
    pass


def convert_to_wav(content: bytes, output_path: Path) -> None:
    """Decode a browser recording or an imported audio file (webm, ogg, mp3, m4a, wav...)
    and write it as a 16-bit mono PCM WAV file, readable by pocket_tts."""
    if not content:
        raise ConversionError("Fichier audio vide.")
    if len(content) > MAX_RECORDING_BYTES:
        raise ConversionError("Fichier audio trop volumineux (20 Mo max).")

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
        raise ConversionError("Impossible de convertir ce fichier audio.") from exc
    finally:
        input_container.close()


# Download formats re-encoded from the generated Opus/WebM file:
# format -> (PyAV container, codec, bit rate or None for uncompressed).
EXPORT_FORMATS: dict[str, tuple[str, str, int | None]] = {
    "mp3": ("mp3", "mp3", 96_000),
    "m4a": ("ipod", "aac", 96_000),
    "wav": ("wav", "pcm_s16le", None),
}


def convert_for_download(input_path: Path, output_path: Path, export_format: str) -> None:
    """Re-encode a generated audio file (Opus/WebM) to one of EXPORT_FORMATS.
    Writes to a temporary file first so a concurrent request never sees a
    half-written file."""
    container_format, codec, bit_rate = EXPORT_FORMATS[export_format]
    tmp_path = output_path.with_name(f"{output_path.name}.{uuid4().hex}.tmp")

    try:
        with av.open(str(input_path)) as input_container:
            input_stream = input_container.streams.audio[0]

            with av.open(str(tmp_path), mode="w", format=container_format) as output_container:
                output_stream = output_container.add_stream(codec, rate=SAMPLE_RATE)
                output_stream.layout = "mono"
                if bit_rate:
                    output_stream.bit_rate = bit_rate

                resampler = av.AudioResampler(
                    format=output_stream.codec_context.format.name, layout="mono", rate=SAMPLE_RATE
                )

                for frame in input_container.decode(input_stream):
                    for resampled_frame in resampler.resample(frame):
                        for packet in output_stream.encode(resampled_frame):
                            output_container.mux(packet)

                for packet in output_stream.encode(None):
                    output_container.mux(packet)

        tmp_path.replace(output_path)
    except (av.error.FFmpegError, IndexError) as exc:
        raise ConversionError(f"Impossible de convertir l'audio en {export_format.upper()}.") from exc
    finally:
        tmp_path.unlink(missing_ok=True)
