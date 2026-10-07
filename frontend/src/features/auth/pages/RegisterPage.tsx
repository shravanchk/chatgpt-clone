import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useState, type FormEvent } from 'react'
import { Link as RouterLink } from 'react-router'

import { getErrorMessage, getFieldErrors } from '../../../lib/apiError'
import { useRegisterMutation } from '../authApi'
import { AuthLayout } from '../components/AuthLayout'
import {
  hasErrors,
  validateEmail,
  validateNewPassword,
  validateRequired,
  type FieldErrors,
} from '../validation'

type Field = 'display_name' | 'email' | 'password'

export function RegisterPage() {
  const [register, { isLoading, error }] = useRegisterMutation()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({})

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const errors = {
      display_name: validateRequired(displayName, 'Name'),
      email: validateEmail(email),
      password: validateNewPassword(password),
    }
    setFieldErrors(errors)
    if (hasErrors(errors)) return
    try {
      await register({ display_name: displayName.trim(), email: email.trim(), password }).unwrap()
    } catch (err) {
      setFieldErrors(getFieldErrors(err)) // server-side 422s land on their fields
    }
  }

  const serverFieldErrors = Object.keys(getFieldErrors(error)).length > 0

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start chatting in seconds"
      footer={
        <>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Log in
          </Link>
        </>
      }
    >
      <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit}>
        {error && !serverFieldErrors && <Alert severity="error">{getErrorMessage(error)}</Alert>}
        <TextField
          label="Name"
          autoComplete="name"
          autoFocus
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={Boolean(fieldErrors.display_name)}
          helperText={fieldErrors.display_name}
          slotProps={{ htmlInput: { maxLength: 100 } }}
          fullWidth
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email}
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={Boolean(fieldErrors.password)}
          helperText={fieldErrors.password ?? 'At least 8 characters'}
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" loading={isLoading}>
          Create account
        </Button>
      </Stack>
    </AuthLayout>
  )
}
