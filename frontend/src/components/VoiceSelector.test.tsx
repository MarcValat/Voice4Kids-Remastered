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
    onDeleteVoice: vi.fn(),
    cloningEnabled: false,
    recordingPhase: 'idle' as const,
    recordingLevel: 0,
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
    onImportFile: vi.fn(),
    onAddVoice: vi.fn(),
    recordingPreviewUrl: null,
    voiceName: '',
    onVoiceNameChange: vi.fn(),
    error: null,
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

  it('calls onImportFile when an audio file is chosen', async () => {
    const onImportFile = vi.fn()
    render(<VoiceSelector {...baseProps({ cloningEnabled: true, onImportFile })} />)
    await userEvent.click(screen.getByText('Nouvelle voix'))

    const file = new File(['fake'], 'voix.m4a', { type: 'audio/mp4' })
    await userEvent.upload(screen.getByLabelText(/importer un fichier audio/i), file)

    expect(onImportFile).toHaveBeenCalledWith(file)
  })

  it('offers deletion only for saved voices', async () => {
    const onDeleteVoice = vi.fn()
    const voice = { id: 'v1', name: 'Ma voix' }
    render(<VoiceSelector {...baseProps({ savedVoices: [voice], onDeleteVoice })} />)

    expect(screen.queryByLabelText(/supprimer la voix estelle/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/supprimer la voix ma voix/i))

    expect(onDeleteVoice).toHaveBeenCalledWith(voice)
  })

  it('shows voice errors inside the voice section', () => {
    render(<VoiceSelector {...baseProps({ error: 'Impossible de lire ce fichier audio.' })} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Impossible de lire ce fichier audio.')
  })

  it('shows the add button only once a sample is ready', async () => {
    const { rerender } = render(<VoiceSelector {...baseProps({ cloningEnabled: true })} />)
    await userEvent.click(screen.getByText('Nouvelle voix'))
    expect(screen.queryByText(/ajouter la voix/i)).not.toBeInTheDocument()

    rerender(<VoiceSelector {...baseProps({ cloningEnabled: true, recordingPreviewUrl: 'blob:x' })} />)

    expect(screen.getByText(/ajouter la voix/i)).toBeInTheDocument()
  })

  it('closes the panel once the voice is added', async () => {
    const onAddVoice = vi.fn().mockResolvedValue(true)
    render(
      <VoiceSelector {...baseProps({ cloningEnabled: true, recordingPreviewUrl: 'blob:x', onAddVoice })} />
    )
    await userEvent.click(screen.getByText('Nouvelle voix'))

    await userEvent.click(screen.getByText(/ajouter la voix/i))

    expect(onAddVoice).toHaveBeenCalled()
    expect(screen.queryByText(/ajouter la voix/i)).not.toBeInTheDocument()
  })

  it('keeps the panel open if adding the voice fails', async () => {
    const onAddVoice = vi.fn().mockResolvedValue(false)
    render(
      <VoiceSelector {...baseProps({ cloningEnabled: true, recordingPreviewUrl: 'blob:x', onAddVoice })} />
    )
    await userEvent.click(screen.getByText('Nouvelle voix'))

    await userEvent.click(screen.getByText(/ajouter la voix/i))

    expect(screen.getByText(/ajouter la voix/i)).toBeInTheDocument()
  })
})
