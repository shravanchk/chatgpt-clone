import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { useColorScheme } from '@mui/material/styles'

type Mode = 'light' | 'dark' | 'system'

const NEXT_MODE: Record<Mode, Mode> = { light: 'dark', dark: 'system', system: 'light' }
const ICONS: Record<Mode, React.ReactElement> = {
  light: <LightModeOutlined fontSize="small" />,
  dark: <DarkModeOutlined fontSize="small" />,
  system: <SettingsBrightnessOutlined fontSize="small" />,
}

/** Cycles light → dark → system. Persisting to user settings comes with the settings feature. */
export function ThemeModeToggle() {
  const { mode, setMode } = useColorScheme()
  if (!mode) return null // not resolved yet (first render)

  return (
    <Tooltip title={`Theme: ${mode}`}>
      <IconButton aria-label={`Theme: ${mode}`} onClick={() => setMode(NEXT_MODE[mode])}>
        {ICONS[mode]}
      </IconButton>
    </Tooltip>
  )
}
