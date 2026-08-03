import { useEffect, useRef } from 'react'
import Section from './Section'
import Button from './Button'

// Must match backend app/services/tts.py SAMPLE_RATE.
const SAMPLE_RATE = 24000
const BYTE_RATE = SAMPLE_RATE * 1 * 2 // mono, 16-bit
const WAV_HEADER_BYTES = 44
const REFRESH_INTERVAL_MS = 1000
// Once playback catches up to the live edge, wait for at least this much new
// audio before resuming — resuming for every tiny sliver as it trickles in
// (especially on a slow machine) causes rapid play/pause flicker.
const MIN_RESUME_BYTES = BYTE_RATE * 1

function LoadingBars() {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1 animate-bounce rounded-full bg-white"
          style={{ height: '100%', animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

/** Builds a complete, properly-sized WAV file from accumulated PCM chunks —
 * unlike the raw HTTP stream (which browsers can't seek in), a Blob is a
 * real, fully-buffered resource the <audio> element can seek within freely. */
function buildWavBlob(
  chunks: Uint8Array<ArrayBuffer>[],
  sampleRate: number,
  channels = 1,
  bitsPerSample = 16
): Blob {
  const dataSize = chunks.reduce((sum, c) => sum + c.length, 0)
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign

  const header = new ArrayBuffer(WAV_HEADER_BYTES)
  const view = new DataView(header)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  return new Blob([header, ...chunks], { type: 'audio/wav' })
}

type GenerationPanelProps = {
  status: 'idle' | 'loading' | 'error'
  onGenerate: () => void
  onCancel: () => void
  canGenerate: boolean
  error: string | null
  audioUrl: string | null
}

export default function GenerationPanel({
  status,
  onGenerate,
  onCancel,
  canGenerate,
  error,
  audioUrl,
}: GenerationPanelProps) {
  const streamAudioRef = useRef<HTMLAudioElement | null>(null)
  const finalAudioRef = useRef<HTMLAudioElement | null>(null)
  // Where playback was on the live element when generation completed, so the
  // final player can resume from there instead of restarting from zero.
  const handoffRef = useRef<{ time: number } | null>(null)

  // While generating, re-fetch the live stream ourselves (instead of pointing
  // <audio src> straight at it) so we can rebuild a real, seekable Blob from
  // what's been received so far — the raw chunked stream itself can't be
  // sought/rewound in a browser.
  useEffect(() => {
    const audioEl = streamAudioRef.current
    if (!audioUrl || status !== 'loading' || !audioEl) return

    let lastBlobUrl: string | null = null
    let headerRemaining = WAV_HEADER_BYTES
    let pendingBytes = 0
    let waitingForMore = false
    let streamDone = false
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

    // Swapping .src always causes a brief audible cut — only do it when
    // nothing is actively playing (paused, or right as playback reaches the
    // end of what's buffered so far, i.e. about to stop anyway).
    const rebuild = (resume: boolean) => {
      if (pendingBytes === 0 || chunks.length === 0) return
      pendingBytes = 0

      const blob = buildWavBlob(chunks, SAMPLE_RATE)
      const newUrl = URL.createObjectURL(blob)
      const currentTime = audioEl.currentTime

      audioEl.src = newUrl
      audioEl.currentTime = currentTime
      if (resume) audioEl.play().catch(() => {})

      if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl)
      lastBlobUrl = newUrl
    }

    const tick = () => {
      if (waitingForMore) {
        // Caught up to the live edge earlier — only resume once there's a
        // meaningful amount of new audio (or generation is truly done).
        if (pendingBytes >= MIN_RESUME_BYTES || streamDone) {
          waitingForMore = false
          rebuild(true)
        }
        return
      }
      if (pendingBytes === 0) return
      // audioEl.paused alone isn't reliable here: clicking play before any
      // audio has loaded sets paused=false immediately (the browser queues
      // the play attempt) even though nothing is actually playing yet.
      // Loading the first blob is always safe in that case too.
      if (audioEl.paused || audioEl.readyState === 0) rebuild(!audioEl.paused)
    }

    const handleEnded = () => {
      if (streamDone) {
        // Flush a final leftover bit that arrived while we were still
        // playing (and so skipped loading it) — otherwise the very end of
        // the story would be silently cut off.
        if (pendingBytes > 0) rebuild(true)
        return
      }
      waitingForMore = true
    }

    const refreshInterval = setInterval(tick, REFRESH_INTERVAL_MS)
    audioEl.addEventListener('ended', handleEnded)

    fetch(audioUrl)
      .then(async (res) => {
        if (!res.body) return
        reader = res.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value || value.length === 0) continue

          let data = value
          if (headerRemaining > 0) {
            const skip = Math.min(headerRemaining, data.length)
            data = data.slice(skip)
            headerRemaining -= skip
            if (data.length === 0) continue
          }
          const chunk = new Uint8Array(data)
          chunks.push(chunk)
          pendingBytes += chunk.length
        }
      })
      .catch(() => {})
      .finally(() => {
        streamDone = true
        tick()
      })

    return () => {
      // Remember where we were so the final player (once generation
      // completes) can resume from here instead of restarting at 0:00.
      handoffRef.current = { time: audioEl.currentTime }
      clearInterval(refreshInterval)
      audioEl.removeEventListener('ended', handleEnded)
      reader?.cancel().catch(() => {})
      if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl)
    }
  }, [audioUrl, status])

  // Once the final file is ready, resume playback position where the live
  // player left off (browsers block auto-resuming a freshly-created <audio>
  // element without a fresh user gesture, so this restores the position but
  // doesn't auto-play — one click on play continues from there).
  useEffect(() => {
    if (status !== 'idle' || !audioUrl) return
    const audio = finalAudioRef.current
    const handoff = handoffRef.current
    handoffRef.current = null
    if (!audio || !handoff) return

    const applyHandoff = () => {
      audio.currentTime = handoff.time
    }

    // A freshly-mounted <audio> hasn't loaded metadata yet — seeking
    // immediately can be silently ignored. Wait until it's actually ready.
    if (audio.readyState >= 1) {
      applyHandoff()
    } else {
      audio.addEventListener('loadedmetadata', applyHandoff, { once: true })
      return () => audio.removeEventListener('loadedmetadata', applyHandoff)
    }
  }, [audioUrl, status])

  return (
    <Section title="Générer l'audio" icon="✨">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onGenerate} disabled={status === 'loading' || !canGenerate} className="min-w-40">
          {status === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              Génération <LoadingBars />
            </span>
          ) : (
            '✨ Générer'
          )}
        </Button>
        {status === 'loading' && (
          <Button variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {audioUrl && status === 'loading' && (
        <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
          <p className="mb-3 text-sm text-orange-700">
            🎧 Écoute en direct pendant la génération — tu peux avancer/reculer dans ce qui a déjà
            été généré.
          </p>
          <audio ref={streamAudioRef} controls className="w-full" />
        </div>
      )}
      {audioUrl && status === 'idle' && (
        <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
          <p className="mb-3 text-sm text-orange-700">🎉 Ton histoire est prête !</p>
          <audio ref={finalAudioRef} controls src={audioUrl} className="w-full" />
        </div>
      )}
    </Section>
  )
}
