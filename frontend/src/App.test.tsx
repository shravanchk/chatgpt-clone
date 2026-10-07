import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'

function stubHealth(ok: boolean) {
  const response = ok
    ? new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    : new Response(null, { status: 503 })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
}

describe('App', () => {
  beforeEach(() => window.history.pushState({}, '', '/'))

  it('renders the chat page and reports API status', async () => {
    stubHealth(true)
    render(<App />)

    expect(screen.getByText('What can I help with?')).toBeInTheDocument()
    expect(await screen.findByText('API online')).toBeInTheDocument()
  })

  it('shows API offline when health check fails', async () => {
    stubHealth(false)
    render(<App />)

    expect(await screen.findByText('API offline')).toBeInTheDocument()
  })

  it('renders the login page at /login', () => {
    stubHealth(true)
    window.history.pushState({}, '', '/login')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})
