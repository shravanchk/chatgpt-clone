import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

/** Placeholder; the real form (validation, RTK Query mutation) lands in the auth phase. */
export function LoginPage() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 400, p: 4 }}>
        <Stack spacing={2} component="form" noValidate>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600, textAlign: 'center' }}>
            Welcome back
          </Typography>
          <TextField label="Email" type="email" autoComplete="email" disabled fullWidth />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            disabled
            fullWidth
          />
          <Button variant="contained" size="large" disabled>
            Continue
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
