import { useState } from 'react'
import Section from './Section'

type SavedVoice = { id: string; name: string }
type Preset = { id: string; label: string }
export type VoiceOption = { type: 'preset'; id: string } | { type: 'cloned'; id: string }

function sameVoice(a: VoiceOption | null, b: VoiceOption): boolean {
  return a !== null && a.type === b.type && a.id === b.id
}

type VoiceCardProps = {
  label: string
  sublabel: string
  selected: boolean
  onClick: () => void
}

function VoiceCard({ label, sublabel, selected, onClick }: VoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-3 py-3 text-center transition ${
        selected
          ? 'border-orange-400 bg-orange-100 text-orange-950 shadow-sm'
          : 'border-orange-100 bg-white text-orange-800 hover:border-orange-200 hover:bg-orange-50'
      }`}
    >
      <span className="text-2xl">{selected ? '✅' : '🔊'}</span>
      <span className="line-clamp-1 text-sm font-medium">{label}</span>
      <span className="text-xs text-orange-500">{sublabel}</span>
    </button>
  )
}

type VoiceSelectorProps = {
  presets: Preset[]
  savedVoices: SavedVoice[]
  selected: VoiceOption | null
  onSelect: (option: VoiceOption) => void
  cloningEnabled: boolean
  recordingPhase: 'idle' | 'recording' | 'uploading'
  recordingLevel: number
  onStartRecording: () => void
  onStopRecording: () => void
  recordingPreviewUrl: string | null
  voiceName: string
  onVoiceNameChange: (name: string) => void
}

export default function VoiceSelector({
  presets,
  savedVoices,
  selected,
  onSelect,
  cloningEnabled,
  recordingPhase,
  recordingLevel,
  onStartRecording,
  onStopRecording,
  recordingPreviewUrl,
  voiceName,
  onVoiceNameChange,
}: VoiceSelectorProps) {
  const [showRecorder, setShowRecorder] = useState(false)

  return (
    <Section title="Choisis une voix" icon="🔊">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {presets.map((p) => (
          <VoiceCard
            key={`preset:${p.id}`}
            label={p.label}
            sublabel="Voix preset"
            selected={sameVoice(selected, { type: 'preset', id: p.id })}
            onClick={() => onSelect({ type: 'preset', id: p.id })}
          />
        ))}
        {savedVoices.map((v) => (
          <VoiceCard
            key={`cloned:${v.id}`}
            label={v.name}
            sublabel="Voix clonée"
            selected={sameVoice(selected, { type: 'cloned', id: v.id })}
            onClick={() => onSelect({ type: 'cloned', id: v.id })}
          />
        ))}
        {cloningEnabled && (
          <button
            type="button"
            onClick={() => setShowRecorder((s) => !s)}
            className="flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-orange-200 px-3 py-3 text-center text-orange-500 transition hover:border-orange-300 hover:bg-orange-50"
          >
            <span className="text-2xl">➕</span>
            <span className="text-sm font-medium">Nouvelle voix</span>
          </button>
        )}
      </div>

      {cloningEnabled && showRecorder && (
        <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
          <input
            type="text"
            value={voiceName}
            onChange={(e) => onVoiceNameChange(e.target.value)}
            placeholder="Nom de cette voix (optionnel)"
            disabled={recordingPhase !== 'idle'}
            className="mb-4 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-gray-800 outline-none focus:border-orange-300 disabled:opacity-50"
          />

          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
              {recordingPhase === 'recording' && (
                <span
                  className="absolute inline-block h-full w-full rounded-full bg-red-400 opacity-50"
                  style={{
                    transform: `scale(${1 + recordingLevel * 1.4})`,
                    transition: 'transform 100ms ease-out',
                  }}
                />
              )}
              <button
                type="button"
                onClick={recordingPhase === 'recording' ? onStopRecording : onStartRecording}
                disabled={recordingPhase === 'uploading'}
                aria-label={recordingPhase === 'recording' ? "Arrêter l'enregistrement" : "Démarrer l'enregistrement"}
                className="relative flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-xl text-white shadow transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {recordingPhase === 'recording' ? '⏹' : '🎙️'}
              </button>
            </div>

            <p className="text-sm text-orange-800">
              {recordingPhase === 'idle' && 'Appuie sur le micro et parle quelques secondes.'}
              {recordingPhase === 'recording' && 'Enregistrement en cours...'}
              {recordingPhase === 'uploading' && 'Traitement de ta voix...'}
            </p>
          </div>

          {recordingPreviewUrl && (
            <div className="mt-4">
              <p className="mb-1 text-sm text-orange-800">Écouter l'enregistrement :</p>
              <audio controls src={recordingPreviewUrl} className="w-full" />
            </div>
          )}
        </div>
      )}

      {!cloningEnabled && presets.length === 0 && (
        <p className="text-sm text-orange-500">Chargement des voix...</p>
      )}
    </Section>
  )
}
