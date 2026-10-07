import { api } from '../../app/api'
import { refreshSession } from '../../app/baseQuery'
import type { AppDispatch } from '../../app/store'
import { credentialsReceived, loggedOut } from './authSlice'
import type { AuthResponse, LoginRequest, RegisterRequest } from './types'

/** Failures are surfaced through the mutation's `error`; nothing to do here. */
async function storeCredentialsOnSuccess(
  _arg: unknown,
  {
    dispatch,
    queryFulfilled,
  }: { dispatch: AppDispatch; queryFulfilled: Promise<{ data: AuthResponse }> },
) {
  try {
    const { data } = await queryFulfilled
    dispatch(credentialsReceived(data))
  } catch {
    // handled by the caller via mutation state
  }
}

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      onQueryStarted: storeCredentialsOnSuccess,
    }),
    register: build.mutation<AuthResponse, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      onQueryStarted: storeCredentialsOnSuccess,
    }),
    /** Restore the session from the refresh cookie (used once at startup). */
    restoreSession: build.mutation<AuthResponse | null, void>({
      queryFn: async (_arg, baseApi, extraOptions) => ({
        data: await refreshSession(baseApi, extraOptions as object),
      }),
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
        } catch {
          // Server-side revoke failed (e.g. offline); still log out locally below.
        } finally {
          // Log out locally even if the server call fails; drop all cached user data.
          dispatch(loggedOut())
          dispatch(api.util.resetApiState())
        }
      },
    }),
  }),
})

export const {
  useLoginMutation,
  useRegisterMutation,
  useRestoreSessionMutation,
  useLogoutMutation,
} = authApi
