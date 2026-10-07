import { describe, expect, it } from 'vitest'

import { settingsApi } from '../features/settings/settingsApi'
import { apiError, authResponse, calls, defaultSettings, json, mockApi, testUser } from '../test/utils'
import { makeStore } from './store'

function storeWithToken(token: string) {
  return makeStore({ auth: { accessToken: token, user: testUser, status: 'authenticated' } })
}

/** Settings endpoint that only accepts the given access token. */
function settingsRequiring(token: string) {
  return (request: Request) =>
    request.headers.get('Authorization') === `Bearer ${token}`
      ? json(defaultSettings)
      : apiError(401, 'token_expired', 'Access token expired')
}

describe('baseQueryWithReauth', () => {
  it('refreshes once on 401 and retries the original request', async () => {
    const fetchMock = mockApi({
      'GET /users/me/settings': settingsRequiring('access-2'),
      'POST /auth/refresh': () => json(authResponse('access-2')),
    })
    const store = storeWithToken('expired')

    const result = await store.dispatch(settingsApi.endpoints.getSettings.initiate())

    expect(result.data).toEqual(defaultSettings)
    expect(store.getState().auth.accessToken).toBe('access-2')
    expect(calls(fetchMock, 'POST', '/auth/refresh')).toBe(1)
    expect(calls(fetchMock, 'GET', '/users/me/settings')).toBe(2)
  })

  it('shares one refresh between parallel 401s', async () => {
    const fetchMock = mockApi({
      'GET /users/me/settings': settingsRequiring('access-2'),
      'GET /models': (request) =>
        request.headers.get('Authorization') === 'Bearer access-2'
          ? json({ models: ['mock'], default: 'mock' })
          : apiError(401, 'token_expired', 'Access token expired'),
      'POST /auth/refresh': () => json(authResponse('access-2')),
    })
    const store = storeWithToken('expired')

    await Promise.all([
      store.dispatch(settingsApi.endpoints.getSettings.initiate()),
      store.dispatch(settingsApi.endpoints.getModels.initiate()),
    ])

    expect(calls(fetchMock, 'POST', '/auth/refresh')).toBe(1)
  })

  it('logs out when the refresh token is rejected', async () => {
    mockApi({
      'GET /users/me/settings': () => apiError(401, 'token_expired', 'Access token expired'),
      'POST /auth/refresh': () =>
        apiError(401, 'invalid_refresh_token', 'Session expired, please log in again'),
    })
    const store = storeWithToken('expired')

    const result = await store.dispatch(settingsApi.endpoints.getSettings.initiate())

    expect(result.error).toMatchObject({ status: 401 })
    expect(store.getState().auth).toEqual({ accessToken: null, user: null, status: 'anonymous' })
  })
})
