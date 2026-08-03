import { useEffect, useState } from 'react'

const API_URL = 'http://127.0.0.1:8000'

function App() {
  const [voices, setVoices] = useState<string[]>([])
  const [voice, setVoice] = useState('')
  const [text, setText] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
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

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Écris ton texte ici..."
        rows={5}
        cols={50}
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
