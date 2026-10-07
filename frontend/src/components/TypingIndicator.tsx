import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'

const pulse = keyframes`
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
`

/** Three pulsing dots shown until the first token arrives. */
export function TypingIndicator() {
  return (
    <Box role="status" aria-label="Assistant is typing" sx={{ display: 'flex', gap: 0.75, py: 1.25 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'text.secondary',
            animation: `${pulse} 1.2s ease-in-out ${i * 0.15}s infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.6 },
          }}
        />
      ))}
    </Box>
  )
}
