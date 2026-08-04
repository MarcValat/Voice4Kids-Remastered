import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const API_URL = 'http://127.0.0.1:8000'

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('App', () => {
  it('loads presets on mount and selects the first one by default', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          presets: [
            { id: 'estelle', label: 'Estelle' },
            { id: 'marius', label: 'Marius' },
          ],
          cloning_enabled: false,
        })
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByText('Estelle')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/voices`, undefined)
  })

  it('starts a generation job with the selected voice and text', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/api/voices')) {
        return Promise.resolve(jsonResponse({ presets: [{ id: 'estelle', label: 'Estelle' }], cloning_enabled: false }))
      }
      if (url.endsWith('/api/synthesize')) {
        return Promise.resolve(jsonResponse({ job_id: 'job-1' }))
      }
      if (url.includes('/status')) {
        return Promise.resolve(jsonResponse({ status: 'in_progress' }))
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByText('Estelle')

    await userEvent.type(screen.getByPlaceholderText(/écris ton texte/i), 'Bonjour')
    await userEvent.click(screen.getByText('✨ Générer'))

    expect(await screen.findByText('Annuler')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/synthesize`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ text: 'Bonjour', voice: 'estelle' }),
      })
    )
  })

  it('shows an error message when the voices request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down')))
    )

    render(<App />)

    expect(await screen.findByText('Impossible de charger les voix.')).toBeInTheDocument()
  })
})
