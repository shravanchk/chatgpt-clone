import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { AppProviders } from './app/AppProviders'
import { routes } from './app/router'
import { makeStore } from './app/store'

export function App() {
  const [store] = useState(makeStore)
  const [router] = useState(() => createBrowserRouter(routes))

  return (
    <AppProviders store={store}>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
