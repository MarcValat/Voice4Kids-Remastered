import { useEffect, useRef, useState } from 'react'
import {
  DocumentUpload,
  VoiceSelector,
  VoiceSettingsPanel,
  GenerationPanel,
  DEFAULT_VOICE_SETTINGS,
  type VoiceOption,
  type VoiceSettings,
} from '@/components'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const SAVED_VOICES_KEY = 'voice4kids_saved_voices'
const VOICE_SETTINGS_KEY = 'voice4kids_voice_settings'
const MAX_VOICE_FILE_BYTES = 20 * 1024 * 1024 // must match backend MAX_RECORDING_BYTES

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

function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY)
    return raw ? { ...DEFAULT_VOICE_SETTINGS, ...(JSON.parse(raw) as Partial<VoiceSettings>) } : DEFAULT_VOICE_SETTINGS
  } catch {
    return DEFAULT_VOICE_SETTINGS
  }
}

function persistVoiceSettings(settings: VoiceSettings) {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Remembering the sliders is a convenience; ignore storage failures.
  }
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error('Impossible de contacter le serveur.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === 'string' ? detail : `Erreur du serveur (${res.status}).`)
  }
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
  const [pendingSample, setPendingSample] = useState<{ blob: Blob; filename: string } | null>(null)
  const [voiceName, setVoiceName] = useState('')
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([])
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings)
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
      .catch(() => setVoiceError('Impossible de charger les voix.'))

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

  const setSample = (sample: { blob: Blob; filename: string } | null) => {
    if (recordingPreviewUrl) URL.revokeObjectURL(recordingPreviewUrl)
    setRecordingPreviewUrl(sample ? URL.createObjectURL(sample.blob) : null)
    setPendingSample(sample)
  }

  const startRecording = async () => {
    setVoiceError(null)
    setSample(null)
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
        setSample({ blob, filename: 'recording.webm' })
        setRecordingPhase('idle')
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingPhase('recording')
    } catch {
      setVoiceError("Impossible d'accéder au microphone.")
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const importVoiceFile = (file: File) => {
    setVoiceError(null)
    if (file.size > MAX_VOICE_FILE_BYTES) {
      setVoiceError('Fichier audio trop volumineux (20 Mo max). Coupe un extrait de quelques secondes.')
      return
    }
    setSample({ blob: file, filename: file.name })
  }

  // Returns whether the voice was added, so the selector can close its panel.
  const addVoice = async (): Promise<boolean> => {
    if (!pendingSample) return false
    setVoiceError(null)
    setRecordingPhase('uploading')
    try {
      const formData = new FormData()
      formData.append('audio', pendingSample.blob, pendingSample.filename)
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
      setSample(null)
      return true
    } catch (err) {
      setVoiceError(toMessage(err))
      return false
    } finally {
      setRecordingPhase('idle')
    }
  }

  const deleteVoice = async (voice: SavedVoice) => {
    if (!window.confirm(`Supprimer la voix « ${voice.name} » ?`)) return
    setVoiceError(null)
    try {
      const res = await fetch(`${API_URL}/api/voices/${voice.id}`, { method: 'DELETE' }).catch(() => null)
      if (!res?.ok) throw new Error('Impossible de supprimer cette voix.')

      const updated = savedVoices.filter((v) => v.id !== voice.id)
      setSavedVoices(updated)
      persistSavedVoices(updated)
      if (selectedVoice?.type === 'cloned' && selectedVoice.id === voice.id) setSelectedVoice(null)
    } catch (err) {
      setVoiceError(toMessage(err))
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
          ? { text, voice_sample_id: selectedVoice.id, settings: voiceSettings }
          : { text, voice: selectedVoice.id, settings: voiceSettings }

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
            onDeleteVoice={deleteVoice}
            cloningEnabled={cloningEnabled}
            recordingPhase={recordingPhase}
            recordingLevel={recordingLevel}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onImportFile={importVoiceFile}
            onAddVoice={addVoice}
            recordingPreviewUrl={recordingPreviewUrl}
            voiceName={voiceName}
            onVoiceNameChange={setVoiceName}
            error={voiceError}
          />

          <VoiceSettingsPanel
            settings={voiceSettings}
            onChange={(settings) => {
              setVoiceSettings(settings)
              persistVoiceSettings(settings)
            }}
            disabled={status === 'loading'}
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
