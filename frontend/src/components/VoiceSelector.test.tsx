import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VoiceSelector from './VoiceSelector'

const presets = [
  { id: 'estelle', label: 'Estelle' },
  { id: 'marius', label: 'Marius' },
]

function baseProps(overrides: Partial<React.ComponentProps<typeof VoiceSelector>> = {}) {
  return {
    presets,
    savedVoices: [],
    selected: null,
    onSelect: vi.fn(),
    cloningEnabled: false,
    recordingPhase: 'idle' as const,
    recordingLevel: 0,
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
    recordingPreviewUrl: null,
    voiceName: '',
    onVoiceNameChange: vi.fn(),
    ...overrides,
  }
}

describe('VoiceSelector', () => {
  it('renders preset and saved voice cards', () => {
    render(<VoiceSelector {...baseProps({ savedVoices: [{ id: 'v1', name: 'Ma voix' }] })} />)

    expect(screen.getByText('Estelle')).toBeInTheDocument()
    expect(screen.getByText('Marius')).toBeInTheDocument()
    expect(screen.getByText('Ma voix')).toBeInTheDocument()
  })

  it('calls onSelect with the right voice when a preset is clicked', async () => {
    const onSelect = vi.fn()
    render(<VoiceSelector {...baseProps({ onSelect })} />)

    await userEvent.click(screen.getByText('Marius'))

    expect(onSelect).toHaveBeenCalledWith({ type: 'preset', id: 'marius' })
  })

  it('hides the "new voice" option when cloning is disabled', () => {
    render(<VoiceSelector {...baseProps({ cloningEnabled: false })} />)

    expect(screen.queryByText('Nouvelle voix')).not.toBeInTheDocument()
  })

  it('toggles the recorder panel when cloning is enabled', async () => {
    render(<VoiceSelector {...baseProps({ cloningEnabled: true })} />)
    expect(screen.queryByLabelText(/démarrer l'enregistrement/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Nouvelle voix'))

    expect(screen.getByLabelText(/démarrer l'enregistrement/i)).toBeInTheDocument()
  })

  it('calls onStartRecording when the mic button is pressed', async () => {
    const onStartRecording = vi.fn()
    render(<VoiceSelector {...baseProps({ cloningEnabled: true, onStartRecording })} />)
    await userEvent.click(screen.getByText('Nouvelle voix'))

    await userEvent.click(screen.getByLabelText(/démarrer l'enregistrement/i))

    expect(onStartRecording).toHaveBeenCalled()
  })
})
