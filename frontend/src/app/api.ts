import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export interface HealthResponse {
  status: 'ok'
}

/**
 * Single RTK Query API; feature modules extend it with `api.injectEndpoints`.
 * Requests go to `/api/v1` on the same origin (nginx or the Vite dev proxy forwards them).
 */
export const api = createApi({
  reducerPath: 'api',
  // Absolute URL so the same code works in the browser and in jsdom tests.
  baseQuery: fetchBaseQuery({
    baseUrl: `${window.location.origin}/api/v1`,
    credentials: 'include',
  }),
  tagTypes: ['Me', 'Settings', 'Conversation', 'Message'],
  endpoints: (build) => ({
    getHealth: build.query<HealthResponse, void>({ query: () => '/health' }),
  }),
})

export const { useGetHealthQuery } = api
