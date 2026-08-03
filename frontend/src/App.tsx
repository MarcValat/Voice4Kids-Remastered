import { useEffect, useRef, useState } from 'react'
import { DocumentUpload, VoiceSelector, GenerationPanel, type VoiceOption } from '@/components'

const API_URL = 'http://127.0.0.1:8000'
const SAVED_VOICES_KEY = 'voice4kids_saved_voices'

type SavedVoice = { id: string; name: string }
type Preset = { id: string; label: string }

function loadSavedVoices(): SavedVoice[] {
  try {
    const raw = localStorage.getItem(SAVED_VOICES_KEY)
    return raw ? (JSON.parse(raw) as SavedVoice[]) : []
  } catch {
    return []
  }
}

function persistSavedVoices(voices: SavedVoice[]) {
  localStorage.setItem(SAVED_VOICES_KEY, JSON.stringify(voices))
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail ?? 'Erreur inconnue')
  return data as T
}

function cancelJob(jobId: string, keepalive = false) {
  return fetch(`${API_URL}/api/synthesize/${jobId}/cancel`, { method: 'POST', keepalive })
}

function App() {
  const [presets, setPresets] = useState<Preset[]>([])
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption | null>(null)
  const [text, setText] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cloningEnabled, setCloningEnabled] = useState(false)
  const [recordingPhase, setRecordingPhase] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [recordingLevel, setRecordingLevel] = useState(0)
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState<string | null>(null)
  const [voiceName, setVoiceName] = useState('')
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const currentJobIdRef = useRef<string | null>(null)

  useEffect(() => {
    apiFetch<{ presets: Preset[]; cloning_enabled: boolean }>(`${API_URL}/api/voices`)
      .then((data) => {
        setPresets(data.presets)
        if (data.presets.length > 0) setSelectedVoice({ type: 'preset', id: data.presets[0].id })
        setCloningEnabled(data.cloning_enabled)
      })
      .catch(() => setError('Impossible de charger les voix.'))

    setSavedVoices(loadSavedVoices())
  }, [])

  useEffect(() => {
    const cancelCurrentJob = () => {
      const jobId = currentJobIdRef.current
      if (jobId) cancelJob(jobId, true)
    }
    window.addEventListener('pagehide', cancelCurrentJob)
    window.addEventListener('beforeunload', cancelCurrentJob)
    return () => {
      window.removeEventListener('pagehide', cancelCurrentJob)
      window.removeEventListener('beforeunload', cancelCurrentJob)
    }
  }, [])

  const handleFile = async (file: File) => {
    setExtracting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await apiFetch<{ text: string }>(`${API_URL}/api/extract`, {
        method: 'POST',
        body: formData,
      })
      setText(data.text)
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setExtracting(false)
    }
  }

  const startRecording = async () => {
    setError(null)
    setRecordingPreviewUrl(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext

      const levels = new Uint8Array(analyser.frequencyBinCount)
      const updateLevel = () => {
        analyser.getByteFrequencyData(levels)
        const avg = levels.reduce((sum, v) => sum + v, 0) / levels.length
        setRecordingLevel(avg / 255)
        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        await audioContextRef.current?.close()
        setRecordingLevel(0)
        stream.getTracks().forEach((t) => t.stop())

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setRecordingPreviewUrl(URL.createObjectURL(blob))
        setRecordingPhase('uploading')
        await uploadVoiceSample(blob)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingPhase('recording')
    } catch {
      setError("Impossible d'accéder au microphone.")
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const uploadVoiceSample = async (blob: Blob) => {
    setError(null)
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      const data = await apiFetch<{ voice_id: string }>(`${API_URL}/api/voices/clone`, {
        method: 'POST',
        body: formData,
      })

      setSelectedVoice({ type: 'cloned', id: data.voice_id })

      const name = voiceName.trim() || `Voix du ${new Date().toLocaleDateString('fr-FR')}`
      const updated = [...savedVoices, { id: data.voice_id, name }]
      setSavedVoices(updated)
      persistSavedVoices(updated)
      setVoiceName('')
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setRecordingPhase('idle')
    }
  }

  const pollJobStatus = (jobId: string) => {
    const interval = setInterval(async () => {
      const finish = () => {
        clearInterval(interval)
        currentJobIdRef.current = null
      }
      try {
        const data = await apiFetch<{ status: string; audio_url?: string; error?: string }>(
          `${API_URL}/api/synthesize/${jobId}/status`
        )

        if (data.status === 'complete') {
          // audioUrl stays pointed at the live /stream endpoint — the
          // MediaSource-backed player already holds the complete audio by
          // the time generation finishes, no need to swap to a final file.
          // The final file is only used for the download link.
          finish()
          if (data.audio_url) setDownloadUrl(`${API_URL}${data.audio_url}`)
          setStatus('idle')
        } else if (data.status === 'cancelled') {
          finish()
          setAudioUrl(null)
          setDownloadUrl(null)
          setError('Génération annulée.')
          setStatus('idle')
        } else if (data.status === 'error') {
          finish()
          setError(data.error ?? 'Erreur de génération.')
          setStatus('error')
        }
      } catch {
        finish()
        setError('Erreur de suivi de la génération.')
        setStatus('error')
      }
    }, 1000)
  }

  const cancelGeneration = async () => {
    const jobId = currentJobIdRef.current
    if (!jobId) return
    try {
      await cancelJob(jobId)
    } catch {
      // best effort — the beforeunload/pagehide handler also tries this
    }
  }

  const handleGenerate = async () => {
    if (!selectedVoice) return

    setStatus('loading')
    setError(null)
    setAudioUrl(null)
    setDownloadUrl(null)
    try {
      const body =
        selectedVoice.type === 'cloned'
          ? { text, voice_sample_id: selectedVoice.id }
          : { text, voice: selectedVoice.id }

      const data = await apiFetch<{ job_id: string }>(`${API_URL}/api/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Play progressively while the job runs; swapped for the final, seekable
      // file once generation completes (see pollJobStatus).
      currentJobIdRef.current = data.job_id
      setAudioUrl(`${API_URL}/api/synthesize/${data.job_id}/stream`)
      pollJobStatus(data.job_id)
    } catch (err) {
      setError(toMessage(err))
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-orange-950 sm:text-5xl">📖 Voice4Kids</h1>
          <p className="mt-2 text-orange-800/70">
            Transforme tes histoires en audio, avec la voix de ton choix.
          </p>
        </header>

        <div className="space-y-6">
          <DocumentUpload text={text} onTextChange={setText} onFile={handleFile} extracting={extracting} />

          <VoiceSelector
            presets={presets}
            savedVoices={savedVoices}
            selected={selectedVoice}
            onSelect={setSelectedVoice}
            cloningEnabled={cloningEnabled}
            recordingPhase={recordingPhase}
            recordingLevel={recordingLevel}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            recordingPreviewUrl={recordingPreviewUrl}
            voiceName={voiceName}
            onVoiceNameChange={setVoiceName}
          />

          <GenerationPanel
            status={status}
            onGenerate={handleGenerate}
            onCancel={cancelGeneration}
            canGenerate={text.trim().length > 0 && selectedVoice !== null}
            error={error}
            audioUrl={audioUrl}
            downloadUrl={downloadUrl}
          />
        </div>
      </div>
    </div>
  )
}

export default App
