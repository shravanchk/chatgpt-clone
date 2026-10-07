import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'

import type { ThemePreference } from '../features/settings/settingsApi'
import { useThemePreference } from '../features/settings/useThemePreference'

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}
const ICONS: Record<ThemePreference, React.ReactElement> = {
  light: <LightModeOutlined fontSize="small" />,
  dark: <DarkModeOutlined fontSize="small" />,
  system: <SettingsBrightnessOutlined fontSize="small" />,
}

/** Cycles light → dark → system and saves the choice to user settings. */
export function ThemeModeToggle() {
  const { theme, setTheme } = useThemePreference()

  return (
    <Tooltip title={`Theme: ${theme}`}>
      <IconButton aria-label={`Theme: ${theme}`} onClick={() => setTheme(NEXT[theme])}>
        {ICONS[theme]}
      </IconButton>
    </Tooltip>
  )
}
