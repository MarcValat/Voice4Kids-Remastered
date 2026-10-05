import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VoiceSettingsPanel from './VoiceSettingsPanel'
import { DEFAULT_VOICE_SETTINGS } from './voiceSettings'

describe('VoiceSettingsPanel', () => {
  it('renders one slider per setting with default values', () => {
    render(<VoiceSettingsPanel settings={DEFAULT_VOICE_SETTINGS} onChange={vi.fn()} disabled={false} />)

    expect(screen.getByLabelText('Précision')).toHaveValue('1')
    expect(screen.getByLabelText('Expressivité')).toHaveValue('0.7')
    expect(screen.getByLabelText('Vitesse')).toHaveValue('1')
    expect(screen.getByLabelText('Hauteur')).toHaveValue('0')
  })

  it('reports the changed setting while keeping the others', () => {
    const onChange = vi.fn()
    render(<VoiceSettingsPanel settings={DEFAULT_VOICE_SETTINGS} onChange={onChange} disabled={false} />)

    fireEvent.change(screen.getByLabelText('Vitesse'), { target: { value: '0.8' } })

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_VOICE_SETTINGS, speed: 0.8 })
  })

  it('offers a reset only when settings differ from the defaults', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <VoiceSettingsPanel settings={DEFAULT_VOICE_SETTINGS} onChange={onChange} disabled={false} />
    )
    expect(screen.queryByText(/réinitialiser/i)).not.toBeInTheDocument()

    rerender(
      <VoiceSettingsPanel settings={{ ...DEFAULT_VOICE_SETTINGS, pitch: 2 }} onChange={onChange} disabled={false} />
    )
    await userEvent.click(screen.getByText(/réinitialiser/i))

    expect(onChange).toHaveBeenCalledWith(DEFAULT_VOICE_SETTINGS)
  })

  it('disables the sliders while generating', () => {
    render(<VoiceSettingsPanel settings={DEFAULT_VOICE_SETTINGS} onChange={vi.fn()} disabled />)

    expect(screen.getByLabelText('Précision')).toBeDisabled()
  })
})
