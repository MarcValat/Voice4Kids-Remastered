import { useEffect, useState } from 'react'

const API_URL = 'http://127.0.0.1:8000'

function App() {
  const [voices, setVoices] = useState<string[]>([])
  const [voice, setVoice] = useState('')
  const [text, setText] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/voices`)
      .then((res) => res.json())
      .then((data: string[]) => {
        setVoices(data)
        if (data.length > 0) setVoice(data[0])
      })
      .catch(() => setError('Impossible de charger les voix.'))
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setExtracting(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Erreur inconnue')
      setText(data.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExtracting(false)
      e.target.value = ''
    }
  }

  const handleGenerate = async () => {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail ?? 'Erreur inconnue')
      }
      const blob = await res.blob()
      setAudioUrl(URL.createObjectURL(blob))
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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

      <select value={voice} onChange={(e) => setVoice(e.target.value)}>
        {voices.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <br />

      <button onClick={handleGenerate} disabled={status === 'loading' || !text.trim()}>
        {status === 'loading' ? 'Génération...' : 'Générer'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {audioUrl && <audio controls src={audioUrl} />}
    </div>
  )
}

export default App
