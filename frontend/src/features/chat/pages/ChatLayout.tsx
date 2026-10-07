import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import { useMemo, useState } from 'react'
import { Outlet } from 'react-router'

import { Sidebar } from '../components/Sidebar'
import type { ChatLayoutContext } from '../useChatLayout'
import { useChatStream } from '../useChatStream'

const SIDEBAR_WIDTH = 260

/** Sidebar + the current thread. Persists across conversation changes. */
export function ChatLayout() {
  const stream = useChatStream()
  const [mobileOpen, setMobileOpen] = useState(false)
  const context = useMemo<ChatLayoutContext>(
    () => ({ ...stream, openSidebar: () => setMobileOpen(true) }),
    [stream],
  )

  return (
    <Box sx={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      {/* Desktop: permanent sidebar. Mobile: slide-in drawer opened from the header. */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Sidebar />
      </Box>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH } }}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet context={context} />
      </Box>
    </Box>
  )
}
