import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { useAppSelector } from '../../../app/hooks'
import { useRestoreSessionMutation } from '../authApi'
import { selectAuthStatus } from '../authSlice'

interface FromState {
  from?: { pathname: string }
}

/** Restores the session from the refresh cookie once, then renders the routes. */
export function SessionGate() {
  const status = useAppSelector(selectAuthStatus)
  const [restoreSession] = useRestoreSessionMutation()

  useEffect(() => {
    if (status === 'unknown') void restoreSession()
  }, [status, restoreSession])

  if (status === 'unknown') {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    )
  }
  return <Outlet />
}

/** Only for logged-in users; others go to /login and come back afterwards. */
export function RequireAuth() {
  const status = useAppSelector(selectAuthStatus)
  const location = useLocation()

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location } satisfies FromState} />
  }
  return <Outlet />
}

/** Login / register: logged-in users are sent to where they came from (or home). */
export function GuestOnly() {
  const status = useAppSelector(selectAuthStatus)
  const location = useLocation()

  if (status === 'authenticated') {
    const from = (location.state as FromState | null)?.from?.pathname ?? '/'
    return <Navigate to={from} replace />
  }
  return <Outlet />
}
