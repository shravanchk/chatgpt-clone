import { createTheme } from '@mui/material/styles'

/**
 * One theme, two color schemes. MUI CSS variables let us switch light/dark/system
 * without re-rendering the tree, and `useColorScheme()` exposes the mode.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-color-scheme' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#0d0d0d', contrastText: '#ffffff' },
        secondary: { main: '#10a37f' },
        background: { default: '#ffffff', paper: '#f9f9f9' },
        text: { primary: '#0d0d0d', secondary: '#5d5d5d' },
        divider: 'rgba(0, 0, 0, 0.1)',
      },
    },
    dark: {
      palette: {
        primary: { main: '#ececec', contrastText: '#0d0d0d' },
        secondary: { main: '#10a37f' },
        background: { default: '#212121', paper: '#171717' },
        text: { primary: '#ececec', secondary: '#b4b4b4' },
        divider: 'rgba(255, 255, 255, 0.1)',
      },
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      'ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
})
