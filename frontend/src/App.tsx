import { useEffect, useRef, useState } from 'react'

const API_URL = 'http://127.0.0.1:8000'
const SAVED_VOICES_KEY = 'voice4kids_saved_voices'

type SavedVoice = { id: string; name: string }

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
  const [presets, setPresets] = useState<string[]>([])
  const [voice, setVoice] = useState('')
  const [text, setText] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cloningEnabled, setCloningEnabled] = useState(false)
  const [recordingPhase, setRecordingPhase] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState<string | null>(null)
  const [voiceName, setVoiceName] = useState('')
  const [savedVoices, setSavedVoices] = useState<SavedVoice[]>([])
  const [voiceSampleId, setVoiceSampleId] = useState<string | null>(null)
  const [useClonedVoice, setUseClonedVoice] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamAudioRef = useRef<HTMLAudioElement | null>(null)
  const [streamPlaying, setStreamPlaying] = useState(false)
  const currentJobIdRef = useRef<string | null>(null)

  useEffect(() => {
    apiFetch<{ presets: string[]; cloning_enabled: boolean }>(`${API_URL}/api/voices`)
      .then((data) => {
        setPresets(data.presets)
        if (data.presets.length > 0) setVoice(data.presets[0])
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

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
      e.target.value = ''
    }
  }

  const startRecording = async () => {
    setError(null)
    setRecordingPreviewUrl(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
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

      setVoiceSampleId(data.voice_id)
      setUseClonedVoice(true)

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
          finish()
          setAudioUrl(`${API_URL}${data.audio_url}`)
          setStatus('idle')
        } else if (data.status === 'cancelled') {
          finish()
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

  const toggleStreamPlayback = () => {
    const audio = streamAudioRef.current
    if (!audio) return
    if (streamPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  const handleGenerate = async () => {
    setStatus('loading')
    setError(null)
    setAudioUrl(null)
    setStreamPlaying(false)
    try {
      const body =
        useClonedVoice && voiceSampleId
          ? { text, voice_sample_id: voiceSampleId }
          : { text, voice }

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
    <div>
      <h1>Voice4Kids</h1>

      <label htmlFor="storyFile">Importer un document (PDF ou DOCX) :</label>
      <br />
      <input
        id="storyFile"
        type="file"
        accept=".pdf,.docx"
        onChange={handleFileUpload}
        disabled={extracting}
      />
      {extracting && <p>Extraction du texte...</p>}
      <br />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Écris ton texte ici, ou importe un document ci-dessus..."
        rows={8}
        cols={60}
      />
      <br />

      {cloningEnabled && (
        <>
          <h2>Cloner ma voix</h2>

          {savedVoices.length > 0 && (
            <>
              <label htmlFor="savedVoice">Voix déjà enregistrées :</label>
              <br />
              <select
                id="savedVoice"
                value={voiceSampleId ?? ''}
                onChange={(e) => {
                  setVoiceSampleId(e.target.value)
                  setUseClonedVoice(true)
                  setRecordingPreviewUrl(null)
                }}
              >
                <option value="" disabled>
                  -- Choisir une voix --
                </option>
                {savedVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <br />
            </>
          )}

          <input
            type="text"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder="Nom de cette voix (optionnel)"
            disabled={recordingPhase !== 'idle'}
          />
          <br />

          {recordingPhase === 'recording' ? (
            <button onClick={stopRecording}>Arrêter l'enregistrement</button>
          ) : (
            <button onClick={startRecording} disabled={recordingPhase === 'uploading'}>
              Démarrer l'enregistrement
            </button>
          )}
          {recordingPhase === 'uploading' && <p>Traitement de l'enregistrement...</p>}

          {recordingPreviewUrl && (
            <>
              <p>Écouter l'enregistrement :</p>
              <audio controls src={recordingPreviewUrl} />
            </>
          )}

          {voiceSampleId && recordingPhase !== 'uploading' && (
            <>
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={useClonedVoice}
                  onChange={(e) => setUseClonedVoice(e.target.checked)}
                />
                Utiliser la voix clonée sélectionnée
              </label>
            </>
          )}
          <br />
        </>
      )}

      <label htmlFor="voice">Voix preset :</label>
      <br />
      <select
        id="voice"
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        disabled={useClonedVoice}
      >
        {presets.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <br />

      <button onClick={handleGenerate} disabled={status === 'loading' || !text.trim()}>
        {status === 'loading' ? 'Génération...' : 'Générer'}
      </button>
      {status === 'loading' && <button onClick={cancelGeneration}>Annuler</button>}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {audioUrl && status === 'loading' && (
        <>
          <p>Audio en cours de génération (durée pas encore connue).</p>
          <audio
            ref={streamAudioRef}
            src={audioUrl}
            onPlay={() => setStreamPlaying(true)}
            onPause={() => setStreamPlaying(false)}
          />
          <button onClick={toggleStreamPlayback}>
            {streamPlaying ? 'Pause' : 'Écouter en direct'}
          </button>
        </>
      )}
      {audioUrl && status === 'idle' && <audio controls src={audioUrl} />}
    </div>
  )
}

export default App
