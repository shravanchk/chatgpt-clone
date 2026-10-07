import { authApi } from '../features/auth/authApi'
import { API_BASE_URL } from './baseQuery'
import type { AppDispatch, RootState } from './store'

interface ThunkContext {
  dispatch: AppDispatch
  getState: () => RootState
}

/**
 * `fetch` against the API with the bearer token, refreshing once on 401.
 * For calls RTK Query can't model: streaming responses and file downloads.
 */
export async function authorizedFetch(
  path: string,
  init: RequestInit,
  { dispatch, getState }: ThunkContext,
): Promise<Response> {
  const send = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })

  const response = await send(getState().auth.accessToken)
  if (response.status !== 401) return response

  const refreshed = await dispatch(authApi.endpoints.restoreSession.initiate()).unwrap()
  return refreshed ? send(refreshed.access_token) : response
}

/** Parse the backend's error envelope into a user-facing message. */
export async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    // not JSON
  }
  return response.status === 429
    ? 'You are sending messages too quickly. Please wait a moment.'
    : 'Something went wrong. Please try again.'
}
