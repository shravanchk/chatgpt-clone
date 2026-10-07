import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { useState } from 'react'
import { Provider } from 'react-redux'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { routes } from './app/router'
import { makeStore } from './app/store'
import { theme } from './app/theme'

export function App() {
  const [store] = useState(makeStore)
  const [router] = useState(() => createBrowserRouter(routes))

  return (
    <Provider store={store}>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline enableColorScheme />
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>
  )
}
