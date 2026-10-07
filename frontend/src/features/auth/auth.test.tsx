import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  apiError,
  authResponse,
  calls,
  defaultSettings,
  json,
  mockApi,
  renderApp,
} from '../../test/utils'

const anonymous = () =>
  apiError(401, 'invalid_refresh_token', 'Session expired, please log in again')

describe('auth flow', () => {
  it('sends anonymous visitors to the login page', async () => {
    mockApi({ 'POST /auth/refresh': anonymous })

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('restores the session from the refresh cookie on load', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': () => json(authResponse()),
      'GET /users/me/settings': () => json(defaultSettings),
    })

    renderApp('/')

    expect(await screen.findByText('What can I help with, Alice?')).toBeInTheDocument()
    expect(calls(fetchMock, 'POST', '/auth/refresh')).toBe(1)
  })

  it('validates the login form before calling the API', async () => {
    const fetchMock = mockApi({ 'POST /auth/refresh': anonymous })
    renderApp('/login')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Log in' }))

    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(calls(fetchMock, 'POST', '/auth/login')).toBe(0)
  })

  it('shows the server message when credentials are wrong', async () => {
    mockApi({
      'POST /auth/refresh': anonymous,
      'POST /auth/login': () => apiError(401, 'invalid_credentials', 'Invalid email or password'),
    })
    renderApp('/login')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(/email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('logs in and returns to the page the user wanted', async () => {
    mockApi({
      'POST /auth/refresh': anonymous,
      'POST /auth/login': () => json(authResponse()),
      'GET /users/me/settings': () => json(defaultSettings),
    })
    const { router } = renderApp('/c/123')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(/email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('What can I help with, Alice?')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/c/123')
  })

  it('shows field errors from the server on register', async () => {
    mockApi({
      'POST /auth/refresh': anonymous,
      'POST /auth/register': () =>
        apiError(409, 'email_taken', 'An account with this email already exists'),
    })
    renderApp('/register')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(/name/i), 'Alice')
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    await user.type(screen.getByLabelText(/password/i), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/password/i))
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
  })

  it('logs out from the account menu', async () => {
    mockApi({
      'POST /auth/refresh': () => json(authResponse()),
      'GET /users/me/settings': () => json(defaultSettings),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    })
    renderApp('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument(),
    )
  })
})
