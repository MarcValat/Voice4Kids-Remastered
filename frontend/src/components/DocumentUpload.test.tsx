import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocumentUpload from './DocumentUpload'

describe('DocumentUpload', () => {
  it('shows the current text and word count', () => {
    render(<DocumentUpload text="Bonjour le monde" onTextChange={vi.fn()} onFile={vi.fn()} extracting={false} />)

    expect(screen.getByDisplayValue('Bonjour le monde')).toBeInTheDocument()
    expect(screen.getByText('3 mots')).toBeInTheDocument()
  })

  it('calls onTextChange when typing', async () => {
    const onTextChange = vi.fn()
    render(<DocumentUpload text="" onTextChange={onTextChange} onFile={vi.fn()} extracting={false} />)

    await userEvent.type(screen.getByPlaceholderText(/écris ton texte/i), 'A')

    expect(onTextChange).toHaveBeenCalledWith('A')
  })

  it('shows the extracting state', () => {
    render(<DocumentUpload text="" onTextChange={vi.fn()} onFile={vi.fn()} extracting={true} />)

    expect(screen.getByText('Extraction en cours...')).toBeInTheDocument()
  })

  it('calls onFile when a file is selected', async () => {
    const onFile = vi.fn()
    render(<DocumentUpload text="" onTextChange={vi.fn()} onFile={onFile} extracting={false} />)
    const file = new File(['content'], 'story.pdf', { type: 'application/pdf' })

    await userEvent.upload(document.getElementById('storyFile') as HTMLInputElement, file)

    expect(onFile).toHaveBeenCalledWith(file)
  })
})
