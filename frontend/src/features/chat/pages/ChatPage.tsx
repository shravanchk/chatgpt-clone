import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { useAppSelector } from '../../../app/hooks'
import { ThemeModeToggle } from '../../../components/ThemeModeToggle'
import { UserMenu } from '../../auth/components/UserMenu'
import { selectCurrentUser } from '../../auth/authSlice'

/** Placeholder shell; sidebar, message list and composer land in the chat phase. */
export function ChatPage() {
  const user = useAppSelector(selectCurrentUser)

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
        <Stack
          component="header"
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', p: 1 }}
        >
          <Typography variant="h6" component="h1" sx={{ px: 1 }}>
            ChatGPT Clone
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <ThemeModeToggle />
            <UserMenu />
          </Stack>
        </Stack>
        <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', px: 2 }}>
          <Typography variant="h4" component="p" sx={{ fontWeight: 600, textAlign: 'center' }}>
            {user ? `What can I help with, ${user.display_name}?` : 'What can I help with?'}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )
}
