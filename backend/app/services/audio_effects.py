from fractions import Fraction

import av
from av.filter import Graph


class VoiceEffects:
    """Applies speed and pitch changes to a stream of mono float (fltp) audio
    frames, frame by frame, so it can sit between the TTS model and the
    streaming encoder.

    Pitch: `asetrate` replays the audio at a higher/lower rate (shifting both
    pitch and speed), `aresample` brings it back to the original rate, then
    `atempo` compensates the speed change (and applies the requested speed)
    without touching pitch."""

    def __init__(self, sample_rate: int, speed: float = 1.0, pitch_semitones: float = 0.0) -> None:
        pitch_factor = 2 ** (pitch_semitones / 12)
        tempo = speed / pitch_factor
        self.enabled = pitch_semitones != 0 or abs(tempo - 1) > 1e-6
        if not self.enabled:
            return

        self._graph = Graph()
        chain = [
            self._graph.add_abuffer(
                sample_rate=sample_rate,
                format="fltp",
                layout="mono",
                time_base=Fraction(1, sample_rate),
            )
        ]
        if pitch_semitones != 0:
            chain.append(self._graph.add("asetrate", str(round(sample_rate * pitch_factor))))
            chain.append(self._graph.add("aresample", str(sample_rate)))
        if abs(tempo - 1) > 1e-6:
            chain.append(self._graph.add("atempo", f"{tempo:.6f}"))
        # atempo may change the sample format; the encoder expects fltp/mono.
        chain.append(
            self._graph.add(
                "aformat", f"sample_fmts=fltp:sample_rates={sample_rate}:channel_layouts=mono"
            )
        )
        chain.append(self._graph.add("abuffersink"))
        self._graph.link_nodes(*chain).configure()

    def process(self, frame: av.AudioFrame) -> list[av.AudioFrame]:
        if not self.enabled:
            return [frame]
        self._graph.push(frame)
        return self._pull_available()

    def flush(self) -> list[av.AudioFrame]:
        if not self.enabled:
            return []
        self._graph.push(None)
        return self._pull_available()

    def _pull_available(self) -> list[av.AudioFrame]:
        frames = []
        while True:
            try:
                frames.append(self._graph.pull())
            except (av.error.BlockingIOError, av.error.EOFError):
                return frames
