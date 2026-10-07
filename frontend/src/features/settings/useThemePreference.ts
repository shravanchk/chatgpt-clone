import { useColorScheme } from '@mui/material/styles'
import { useCallback, useEffect } from 'react'

import { useAppSelector } from '../../app/hooks'
import { selectAuthStatus } from '../auth/authSlice'
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  type ThemePreference,
} from './settingsApi'

/**
 * Theme preference backed by user settings when logged in.
 * MUI keeps the active mode (and persists it locally for instant paint on reload);
 * the server copy wins once settings load, so the choice follows the user across devices.
 */
export function useThemePreference() {
  const { mode, setMode } = useColorScheme()
  const isAuthenticated = useAppSelector(selectAuthStatus) === 'authenticated'
  const { data: settings } = useGetSettingsQuery(undefined, { skip: !isAuthenticated })
  const [updateSettings] = useUpdateSettingsMutation()

  const serverTheme = settings?.theme
  useEffect(() => {
    if (serverTheme) setMode(serverTheme)
  }, [serverTheme, setMode])

  const setTheme = useCallback(
    (theme: ThemePreference) => {
      setMode(theme)
      if (isAuthenticated) void updateSettings({ theme })
    },
    [isAuthenticated, setMode, updateSettings],
  )

  return { theme: mode ?? 'system', setTheme }
}
