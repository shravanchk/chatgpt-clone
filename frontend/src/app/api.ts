import { createApi } from '@reduxjs/toolkit/query/react'

import { baseQueryWithReauth } from './baseQuery'

/**
 * Single RTK Query API; feature modules extend it with `api.injectEndpoints`.
 * Requests go to `/api/v1` on the same origin (nginx or the Vite dev proxy forwards them).
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Settings', 'Conversation', 'Message'],
  endpoints: () => ({}),
})
