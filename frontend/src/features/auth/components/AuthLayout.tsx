import AutoAwesome from '@mui/icons-material/AutoAwesome'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

import { ThemeModeToggle } from '../../../components/ThemeModeToggle'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2, py: 4 }}>
      <Box sx={{ position: 'fixed', top: 8, right: 8 }}>
        <ThemeModeToggle />
      </Box>
      <Stack spacing={3} sx={{ width: '100%', maxWidth: 400, alignItems: 'center' }}>
        <AutoAwesome sx={{ fontSize: 40 }} aria-hidden />
        <Stack spacing={0.5} sx={{ textAlign: 'center' }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {subtitle}
          </Typography>
        </Stack>
        <Paper variant="outlined" sx={{ width: '100%', p: { xs: 3, sm: 4 } }}>
          {children}
        </Paper>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {footer}
        </Typography>
      </Stack>
    </Box>
  )
}
