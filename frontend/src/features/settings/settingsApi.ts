import { api } from '../../app/api'

export type ThemePreference = 'light' | 'dark' | 'system'

export interface UserSettings {
  theme: ThemePreference
  model: string
  system_prompt: string | null
  updated_at: string
}

export type SettingsUpdate = Partial<Pick<UserSettings, 'theme' | 'model' | 'system_prompt'>>

export interface ModelsResponse {
  provider: 'mock' | 'anthropic'
  models: string[]
  default: string
}

/** The model replies will actually use: the user's choice if the provider offers it. */
export function effectiveModel(settings: UserSettings, models: ModelsResponse): string {
  return models.models.includes(settings.model) ? settings.model : models.default
}

export const settingsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getSettings: build.query<UserSettings, void>({
      query: () => '/users/me/settings',
      providesTags: ['Settings'],
    }),
    updateSettings: build.mutation<UserSettings, SettingsUpdate>({
      query: (body) => ({ url: '/users/me/settings', method: 'PATCH', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          // The PATCH response is the full settings object; no refetch needed.
          void dispatch(settingsApi.util.upsertQueryData('getSettings', undefined, data))
        } catch {
          // surfaced through the mutation's `error`
        }
      },
    }),
    getModels: build.query<ModelsResponse, void>({ query: () => '/models' }),
  }),
})

export const { useGetSettingsQuery, useUpdateSettingsMutation, useGetModelsQuery } = settingsApi
