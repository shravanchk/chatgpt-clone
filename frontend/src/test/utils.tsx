import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'

import { AppProviders } from '../app/AppProviders'
import { routes } from '../app/router'
import { makeStore } from '../app/store'

type Handler = (request: Request) => Response | Promise<Response>

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function apiError(status: number, code: string, message: string, details: unknown = null) {
  return json({ error: { code, message, details } }, status)
}

/**
 * Stub `fetch` with handlers keyed by "METHOD /path" (path relative to /api/v1).
 * Unmatched requests fail the test loudly. Returns the mock for call assertions.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '')
    const handler = handlers[`${request.method} ${path}`]
    if (!handler) throw new Error(`Unhandled request: ${request.method} ${path}`)
    return handler(request)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function toRequest([input, init]: [RequestInfo | URL, RequestInit?]): Request {
  return input instanceof Request ? input : new Request(input, init)
}

export function calls(mock: ReturnType<typeof mockApi>, method: string, path: string): number {
  return requests(mock, method, path).length
}

export function requests(mock: ReturnType<typeof mockApi>, method: string, path: string): Request[] {
  return mock.mock.calls
    .map((args) => toRequest(args as [RequestInfo | URL, RequestInit?]))
    .filter((r) => r.method === method && new URL(r.url).pathname === `/api/v1${path}`)
}

/** A text/event-stream Response emitting the given events (then closing). */
export function sseResponse(events: [string, unknown][]): Response {
  const body = events.map(([event, data]) => `event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`).join('')
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

export function renderApp(path = '/') {
  const store = makeStore()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <AppProviders store={store}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...view, store, router }
}

export const testUser = {
  id: '6f1c2c6e-1111-4c1e-9d55-000000000001',
  email: 'alice@example.com',
  display_name: 'Alice',
  created_at: '2026-10-07T00:00:00Z',
}

export const authResponse = (token = 'access-1') => ({
  user: testUser,
  access_token: token,
  token_type: 'bearer',
  expires_in: 900,
})

export const defaultSettings = {
  theme: 'system',
  model: 'mock',
  system_prompt: null,
  updated_at: '2026-10-07T00:00:00Z',
}

export const emptyPage = { items: [], next_cursor: null }

/** Handlers for the chat endpoints every signed-in screen calls. */
export const signedInDefaults: Record<string, Handler> = {
  'GET /users/me/settings': () => json(defaultSettings),
  'GET /conversations': () => json(emptyPage),
  'GET /models': () => json({ provider: 'mock', models: ['mock'], default: 'mock' }),
}
