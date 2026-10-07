import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Stop from '@mui/icons-material/Stop'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState, type KeyboardEvent } from 'react'

const MAX_LENGTH = 32_000

interface ComposerProps {
  onSend: (content: string) => void
  onStop: () => void
  /** A reply is streaming in this conversation: show Stop instead of Send. */
  streaming: boolean
  /** Sending is not possible right now (e.g. a reply streams elsewhere). */
  disabled?: boolean
  autoFocus?: boolean
}

export function Composer({ onSend, onStop, streaming, disabled = false, autoFocus }: ComposerProps) {
  const [value, setValue] = useState('')
  const canSend = value.trim().length > 0 && !disabled && !streaming

  const submit = () => {
    if (!canSend) return
    onSend(value.trim())
    setValue('')
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    // Enter sends, Shift+Enter adds a newline; ignore Enter while an IME is composing.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <Box sx={{ px: 2, pb: 1.5, pt: 1 }}>
      <Paper
        component="form"
        variant="outlined"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        sx={{
          maxWidth: 768,
          mx: 'auto',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          pl: 2.5,
          pr: 1,
          py: 1,
          borderRadius: 7,
          bgcolor: 'background.default',
          boxShadow: (theme) => theme.shadows[2],
          '&:focus-within': { borderColor: 'text.secondary' },
        }}
      >
        <InputBase
          multiline
          maxRows={8}
          autoFocus={autoFocus}
          placeholder="Message ChatGPT Clone"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          inputProps={{ maxLength: MAX_LENGTH, 'aria-label': 'Message' }}
          sx={{ flex: 1, py: 0.75, fontSize: 16 }}
        />
        {streaming ? (
          <Tooltip title="Stop generating">
            <IconButton
              aria-label="Stop generating"
              onClick={onStop}
              sx={{ bgcolor: 'text.primary', color: 'background.default', '&:hover': { bgcolor: 'text.secondary' } }}
            >
              <Stop fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <IconButton
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            sx={{
              bgcolor: 'text.primary',
              color: 'background.default',
              '&:hover': { bgcolor: 'text.secondary' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
            }}
          >
            <ArrowUpward fontSize="small" />
          </IconButton>
        )}
      </Paper>
      <Typography variant="caption" component="p" sx={{ textAlign: 'center', color: 'text.secondary', mt: 1 }}>
        Replies come from the configured model and can be wrong. Check important info.
      </Typography>
    </Box>
  )
}
