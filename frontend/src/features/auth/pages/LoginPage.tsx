import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState, type FormEvent } from 'react'
import { Link as RouterLink } from 'react-router'

import { getErrorMessage } from '../../../lib/apiError'
import { useLoginMutation } from '../authApi'
import { AuthLayout } from '../components/AuthLayout'
import { hasErrors, validateEmail, validateRequired, type FieldErrors } from '../validation'

type Field = 'email' | 'password'

export function LoginPage() {
  const [login, { isLoading, error }] = useLoginMutation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({})

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const errors = {
      email: validateEmail(email),
      password: validateRequired(password, 'Password'),
    }
    setFieldErrors(errors)
    if (hasErrors(errors)) return
    // On success the auth slice updates and <GuestOnly> redirects; errors render below.
    await login({ email: email.trim(), password }).unwrap().catch(() => undefined)
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue your conversations"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link component={RouterLink} to="/register">
            Sign up
          </Link>
        </>
      }
    >
      <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit}>
        {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email}
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={Boolean(fieldErrors.password)}
          helperText={fieldErrors.password}
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" loading={isLoading}>
          Log in
        </Button>
      </Stack>
    </AuthLayout>
  )
}
