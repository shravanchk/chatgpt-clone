import {
  fetchBaseQuery,
  type BaseQueryApi,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react'

import { credentialsReceived, loggedOut } from '../features/auth/authSlice'
import type { AuthResponse } from '../features/auth/types'
import type { RootState } from './store'

export const API_BASE_URL = `${window.location.origin}/api/v1`
const REFRESH_URL = '/auth/refresh'
const AUTH_URLS = ['/auth/login', '/auth/register', REFRESH_URL, '/auth/logout']

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Single-flight lock: parallel 401s (or StrictMode's double effects) share one refresh.
// Concurrent refreshes would present an already-rotated cookie and fail.
let inFlightRefresh: Promise<AuthResponse | null> | null = null

async function performRefresh(
  api: BaseQueryApi,
  extraOptions: object,
): Promise<AuthResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await rawBaseQuery({ url: REFRESH_URL, method: 'POST' }, api, extraOptions)
    if (result.data) {
      const auth = result.data as AuthResponse
      api.dispatch(credentialsReceived(auth))
      return auth
    }
    // Another tab may have rotated the cookie a moment ago; the browser now holds the
    // new one, so a single retry succeeds where the first attempt lost the race.
    if (result.error?.status !== 401) break
    if (attempt === 0) await sleep(250)
  }
  api.dispatch(loggedOut())
  return null
}

/** Exchange the refresh cookie for a new access token (deduplicated). */
export function refreshSession(
  api: BaseQueryApi,
  extraOptions: object = {},
): Promise<AuthResponse | null> {
  inFlightRefresh ??= performRefresh(api, extraOptions).finally(() => {
    inFlightRefresh = null
  })
  return inFlightRefresh
}

function urlOf(args: string | FetchArgs): string {
  return typeof args === 'string' ? args : args.url
}

/** Adds the bearer token; on 401, refreshes once and retries the original request. */
export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> =
  async (args, api, extraOptions) => {
    let result = await rawBaseQuery(args, api, extraOptions)
    if (result.error?.status === 401 && !AUTH_URLS.includes(urlOf(args))) {
      if (await refreshSession(api, extraOptions)) {
        result = await rawBaseQuery(args, api, extraOptions)
      }
    }
    return result
  }
