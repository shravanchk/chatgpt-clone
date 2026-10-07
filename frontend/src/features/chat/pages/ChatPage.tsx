import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import Link from '@mui/material/Link'

import { useGetHealthQuery } from '../../../app/api'
import { ThemeModeToggle } from '../../../components/ThemeModeToggle'

/** Placeholder; sidebar, message list and composer land in the chat phase. */
export function ChatPage() {
  const { isSuccess, isError } = useGetHealthQuery()
  const apiStatus = isSuccess ? 'API online' : isError ? 'API offline' : 'Checking API…'

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <Box
        component="nav"
        sx={{
          width: 260,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
        }}
      />
      <Stack component="main" sx={{ flex: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', p: 1 }}>
          <Typography variant="h6" component="h1" sx={{ px: 1 }}>
            ChatGPT Clone
          </Typography>
          <ThemeModeToggle />
        </Stack>
        <Stack spacing={2} sx={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h4" component="p" sx={{ fontWeight: 600 }}>
            What can I help with?
          </Typography>
          <Chip
            label={apiStatus}
            color={isSuccess ? 'success' : isError ? 'error' : 'default'}
            variant="outlined"
            size="small"
          />
          <Link component={RouterLink} to="/login">
            Go to login
          </Link>
        </Stack>
      </Stack>
    </Box>
  )
}
