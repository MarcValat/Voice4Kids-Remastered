import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GenerationPanel from './GenerationPanel'

function baseProps(overrides: Partial<React.ComponentProps<typeof GenerationPanel>> = {}) {
  return {
    status: 'idle' as const,
    onGenerate: vi.fn(),
    onCancel: vi.fn(),
    canGenerate: true,
    error: null,
    audioUrl: null,
    downloadUrl: null,
    ...overrides,
  }
}

describe('GenerationPanel', () => {
  it('calls onGenerate when the button is clicked', async () => {
    const onGenerate = vi.fn()
    render(<GenerationPanel {...baseProps({ onGenerate })} />)

    await userEvent.click(screen.getByText('✨ Générer'))

    expect(onGenerate).toHaveBeenCalled()
  })

  it('disables the generate button when canGenerate is false', () => {
    render(<GenerationPanel {...baseProps({ canGenerate: false })} />)

    expect(screen.getByText('✨ Générer')).toBeDisabled()
  })

  it('shows a cancel button while loading and calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<GenerationPanel {...baseProps({ status: 'loading', onCancel })} />)

    await userEvent.click(screen.getByText('Annuler'))

    expect(onCancel).toHaveBeenCalled()
  })

  it('displays the error message when present', () => {
    render(<GenerationPanel {...baseProps({ error: 'Oups' })} />)

    expect(screen.getByText('Oups')).toBeInTheDocument()
  })

  it('shows a browser-unsupported message when MediaSource/Opus is unavailable', () => {
    // jsdom doesn't implement MediaSource, so this exercises the same
    // fallback real Safari users would see.
    render(<GenerationPanel {...baseProps({ status: 'loading', audioUrl: 'http://x/stream' })} />)

    expect(screen.getByText(/ne peut pas lire l'audio/i)).toBeInTheDocument()
  })

  it('shows the download link once the file is ready', () => {
    render(
      <GenerationPanel
        {...baseProps({ status: 'idle', audioUrl: 'http://x/stream', downloadUrl: 'http://x/audio' })}
      />
    )

    expect(screen.getByText(/télécharger/i)).toHaveAttribute('href', 'http://x/audio')
  })

  it('does not show the download link while still loading', () => {
    render(
      <GenerationPanel
        {...baseProps({ status: 'loading', audioUrl: 'http://x/stream', downloadUrl: 'http://x/audio' })}
      />
    )

    expect(screen.queryByText(/télécharger/i)).not.toBeInTheDocument()
  })
})
