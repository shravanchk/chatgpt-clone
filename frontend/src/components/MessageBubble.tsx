import AutoAwesome from '@mui/icons-material/AutoAwesome'
import ErrorOutlined from '@mui/icons-material/ErrorOutlined'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { memo, type ReactNode } from 'react'

import { CopyButton } from './CopyButton'
import { MarkdownRenderer } from './MarkdownRenderer'
import { TypingIndicator } from './TypingIndicator'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  /** The reply is still arriving. */
  streaming?: boolean
  /** The reply was cut off (provider error, Stop, or dropped connection). */
  interrupted?: boolean
  /** Rendered under an assistant message (follow-up action buttons). */
  footer?: ReactNode
}

export const MessageBubble = memo(function MessageBubble({
  role,
  content,
  streaming = false,
  interrupted = false,
  footer,
}: MessageBubbleProps) {
  if (role === 'user') {
    return (
      <Stack sx={{ alignItems: 'flex-end' }} data-testid="user-message">
        <Box
          sx={{
            maxWidth: { xs: '90%', sm: '75%' },
            px: 2.5,
            py: 1.5,
            borderRadius: 3,
            bgcolor: 'action.selected',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {content}
        </Box>
      </Stack>
    )
  }

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="assistant-message">
      <Avatar
        sx={{ width: 28, height: 28, bgcolor: 'transparent', color: 'text.primary', border: 1, borderColor: 'divider' }}
        aria-hidden
      >
        <AutoAwesome sx={{ fontSize: 16 }} />
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
        {streaming && !content ? (
          <TypingIndicator />
        ) : (
          <MarkdownRenderer content={content} streaming={streaming} />
        )}
        {interrupted && (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mt: 1, color: 'warning.main' }}>
            <ErrorOutlined fontSize="small" />
            <Typography variant="body2">Response interrupted</Typography>
          </Stack>
        )}
        {!streaming && content && (
          <Stack direction="row" sx={{ mt: 0.5, ml: -0.75, color: 'text.secondary' }}>
            <CopyButton text={content} label="Copy response" />
          </Stack>
        )}
        {footer}
      </Box>
    </Stack>
  )
})
