import { useEffect, useRef } from 'react'
import Section from './Section'
import Button from './Button'

const MSE_MIME_TYPE = 'audio/webm; codecs="opus"'
// Safari has no WebM/Opus support in MediaSource (or even in a plain <audio
// src>), so there's no in-browser playback fallback for it — only Chrome,
// Edge and Firefox can play the generated audio.
const MSE_SUPPORTED = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(MSE_MIME_TYPE)

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

type GenerationPanelProps = {
  status: 'idle' | 'loading' | 'error'
  onGenerate: () => void
  onCancel: () => void
  canGenerate: boolean
  error: string | null
  audioUrl: string | null
  downloadUrl: string | null
}

export default function GenerationPanel({
  status,
  onGenerate,
  onCancel,
  canGenerate,
  error,
  audioUrl,
  downloadUrl,
}: GenerationPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Streams the audio straight into a MediaSource SourceBuffer as chunks
  // arrive — unlike the old approach (rebuilding a full Blob and swapping
  // .src every so often), appendBuffer() never interrupts playback: if
  // playback catches up to what's buffered, the element just pauses briefly
  // on its own and resumes the instant more data lands, with no reload/pause
  // logic needed on our side. Keyed only on audioUrl (not status) so nothing
  // is torn down when generation completes — the same element and buffer
  // keep serving the now-complete audio afterwards.
  useEffect(() => {
    const audioEl = audioRef.current
    if (!audioUrl || !audioEl || !MSE_SUPPORTED) return

    const mediaSource = new MediaSource()
    const objectUrl = URL.createObjectURL(mediaSource)
    audioEl.src = objectUrl

    let sourceBuffer: SourceBuffer | null = null
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    const pendingChunks: Uint8Array<ArrayBuffer>[] = []
    let streamEnded = false

    const appendNext = () => {
      if (!sourceBuffer || sourceBuffer.updating) return
      const next = pendingChunks.shift()
      if (next) {
        sourceBuffer.appendBuffer(next)
      } else if (streamEnded && mediaSource.readyState === 'open') {
        mediaSource.endOfStream()
      }
    }

    const handleSourceOpen = () => {
      sourceBuffer = mediaSource.addSourceBuffer(MSE_MIME_TYPE)
      sourceBuffer.addEventListener('updateend', appendNext)

      fetch(audioUrl)
        .then(async (res) => {
          if (!res.body) return
          reader = res.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value && value.length > 0) {
              pendingChunks.push(new Uint8Array(value))
              appendNext()
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          streamEnded = true
          appendNext()
        })
    }
    mediaSource.addEventListener('sourceopen', handleSourceOpen, { once: true })

    return () => {
      reader?.cancel().catch(() => {})
      mediaSource.removeEventListener('sourceopen', handleSourceOpen)
      URL.revokeObjectURL(objectUrl)
    }
  }, [audioUrl])

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

      {audioUrl && (status === 'loading' || status === 'idle') && (
        <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
          {MSE_SUPPORTED ? (
            <>
              <p className="mb-3 text-sm text-orange-700">
                {status === 'loading'
                  ? '🎧 Écoute en direct pendant la génération — tu peux avancer/reculer dans ce qui a déjà été généré.'
                  : '🎉 Ton histoire est prête !'}
              </p>
              <audio ref={audioRef} controls className="w-full" />
            </>
          ) : (
            <p className="text-sm text-rose-700">
              ⚠️ Ton navigateur ne peut pas lire l'audio ici (Safari n'est pas supporté). Utilise
              Chrome, Edge ou Firefox.
            </p>
          )}
          {status === 'idle' && downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 hover:text-orange-900"
            >
              ⬇️ Télécharger l'audio
            </a>
          )}
        </div>
      )}
    </Section>
  )
}
