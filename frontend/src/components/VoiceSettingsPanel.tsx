import Section from './Section'
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from './voiceSettings'

type SliderDef = {
  key: keyof VoiceSettings
  label: string
  description: string
  min: number
  max: number
  step: number
  minLabel: string
  maxLabel: string
  format: (value: number) => string
}

const SLIDERS: SliderDef[] = [
  {
    key: 'precision',
    label: 'Précision',
    description: 'Voix plus nette et fidèle, mais génération plus longue.',
    min: 1,
    max: 8,
    step: 1,
    minLabel: 'Rapide',
    maxLabel: 'Précise',
    format: (v) => `${v} / 8`,
  },
  {
    key: 'expressiveness',
    label: 'Expressivité',
    description: 'Plus haut : voix plus vivante et variée, avec un petit risque de bafouillage.',
    min: 0.3,
    max: 1,
    step: 0.05,
    minLabel: 'Calme',
    maxLabel: 'Vivante',
    format: (v) => `${Math.round(v * 100)} %`,
  },
  {
    key: 'speed',
    label: 'Vitesse',
    description: 'Vitesse de lecture, sans changer la voix.',
    min: 0.7,
    max: 1.3,
    step: 0.05,
    minLabel: 'Lente',
    maxLabel: 'Rapide',
    format: (v) => `×${v.toFixed(2)}`,
  },
  {
    key: 'pitch',
    label: 'Hauteur',
    description: 'Voix plus grave ou plus aiguë (en demi-tons).',
    min: -3,
    max: 3,
    step: 0.5,
    minLabel: 'Grave',
    maxLabel: 'Aiguë',
    format: (v) => (v === 0 ? 'normale' : `${v > 0 ? '+' : ''}${v}`),
  },
]

type VoiceSettingsPanelProps = {
  settings: VoiceSettings
  onChange: (settings: VoiceSettings) => void
  disabled: boolean
}

export default function VoiceSettingsPanel({ settings, onChange, disabled }: VoiceSettingsPanelProps) {
  const isDefault = SLIDERS.every((s) => settings[s.key] === DEFAULT_VOICE_SETTINGS[s.key])

  return (
    <Section title="Réglages de la voix" icon="🎚️">
      <div className="grid gap-5 sm:grid-cols-2">
        {SLIDERS.map((s) => (
          <div key={s.key}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={`setting-${s.key}`} className="font-medium text-orange-950">
                {s.label}
              </label>
              <span className="text-sm text-orange-700">{s.format(settings[s.key])}</span>
            </div>
            <input
              id={`setting-${s.key}`}
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={settings[s.key]}
              onChange={(e) => onChange({ ...settings, [s.key]: Number(e.target.value) })}
              disabled={disabled}
              className="mt-2 w-full accent-orange-500 disabled:opacity-50"
            />
            <div className="flex justify-between text-xs text-orange-400">
              <span>{s.minLabel}</span>
              <span>{s.maxLabel}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{s.description}</p>
          </div>
        ))}
      </div>

      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_VOICE_SETTINGS)}
          disabled={disabled}
          className="mt-5 text-sm font-medium text-orange-700 hover:text-orange-900 disabled:opacity-50"
        >
          ↺ Réinitialiser les réglages
        </button>
      )}
    </Section>
  )
}
