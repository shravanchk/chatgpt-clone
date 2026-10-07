import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { AuthResponse, User } from './types'

/** `unknown` until the startup refresh attempt settles. */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

export interface AuthState {
  /** Kept in memory only (never localStorage) so XSS cannot read a persisted token. */
  accessToken: string | null
  user: User | null
  status: AuthStatus
}

const initialState: AuthState = { accessToken: null, user: null, status: 'unknown' }

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    credentialsReceived(state, action: PayloadAction<AuthResponse>) {
      state.accessToken = action.payload.access_token
      state.user = action.payload.user
      state.status = 'authenticated'
    },
    loggedOut(): AuthState {
      return { ...initialState, status: 'anonymous' }
    },
  },
  selectors: {
    selectAuthStatus: (state) => state.status,
    selectCurrentUser: (state) => state.user,
    selectAccessToken: (state) => state.accessToken,
  },
})

export const { credentialsReceived, loggedOut } = authSlice.actions
export const { selectAuthStatus, selectCurrentUser, selectAccessToken } = authSlice.selectors
