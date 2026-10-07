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
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input)
    const path = new URL(request.url).pathname.replace(/^\/api\/v1/, '')
    const handler = handlers[`${request.method} ${path}`]
    if (!handler) throw new Error(`Unhandled request: ${request.method} ${path}`)
    return handler(request)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export function calls(mock: ReturnType<typeof mockApi>, method: string, path: string): number {
  return mock.mock.calls.filter(([input]) => {
    const request = input as Request
    return request.method === method && new URL(request.url).pathname === `/api/v1${path}`
  }).length
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
