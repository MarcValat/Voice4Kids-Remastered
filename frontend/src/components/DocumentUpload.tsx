import { useState, type ChangeEvent, type DragEvent } from 'react'
import Section from './Section'

type DocumentUploadProps = {
  text: string
  onTextChange: (text: string) => void
  onFile: (file: File) => void
  extracting: boolean
}

export default function DocumentUpload({ text, onTextChange, onFile, extracting }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <Section title="Ton histoire" icon="📄">
      <label
        htmlFor="storyFile"
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 transition ${
          isDragging
            ? 'border-orange-400 bg-orange-100 text-orange-800'
            : 'border-orange-200 bg-orange-50/50 text-orange-700 hover:border-orange-300 hover:bg-orange-50'
        }`}
      >
        {extracting ? 'Extraction en cours...' : '📎 Glisse un PDF/DOCX ici, ou clique pour choisir'}
      </label>
      <input
        id="storyFile"
        type="file"
        accept=".pdf,.docx"
        onChange={handleInputChange}
        disabled={extracting}
        className="hidden"
      />

      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Écris ton texte ici, ou importe un document ci-dessus..."
        rows={8}
        className="mt-4 w-full resize-y rounded-2xl border border-orange-100 bg-orange-50/30 p-4 text-gray-800 outline-none placeholder:text-gray-400 focus:border-orange-300 focus:bg-white"
      />
      <p className="mt-1 text-right text-xs text-orange-400">{wordCount} mot{wordCount !== 1 ? 's' : ''}</p>
    </Section>
  )
}
