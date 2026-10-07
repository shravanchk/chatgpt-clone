import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import CodeOutlined from '@mui/icons-material/CodeOutlined'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactElement } from 'react'

const SUGGESTIONS: { icon: ReactElement; title: string; prompt: string }[] = [
  { icon: <TableChartOutlined />, title: 'Compare in a table', prompt: 'Show me a table comparing popular programming languages' },
  { icon: <BarChartOutlined />, title: 'Draw a chart', prompt: 'Draw a chart of monthly active users' },
  { icon: <CodeOutlined />, title: 'Write some code', prompt: 'Show me code for a debounce function' },
  { icon: <ImageOutlined />, title: 'Show an image', prompt: 'Show me an image of a mountain lake' },
]

interface EmptyStateProps {
  greeting: string
  onPick: (prompt: string) => void
  disabled?: boolean
}

export function EmptyState({ greeting, onPick, disabled = false }: EmptyStateProps) {
  return (
    <Stack spacing={4} sx={{ alignItems: 'center', justifyContent: 'center', flex: 1, px: 2, py: 6 }}>
      <Typography variant="h4" component="h2" sx={{ fontWeight: 600, textAlign: 'center' }}>
        {greeting}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
          gap: 1.5,
          width: '100%',
          maxWidth: 640,
        }}
      >
        {SUGGESTIONS.map((s) => (
          <ButtonBase
            key={s.title}
            disabled={disabled}
            onClick={() => onPick(s.prompt)}
            sx={{
              justifyContent: 'flex-start',
              textAlign: 'left',
              gap: 1.5,
              p: 2,
              borderRadius: 3,
              border: 1,
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {s.icon}
            <Box>
              <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                {s.title}
              </Typography>
              <Typography variant="caption">{s.prompt}</Typography>
            </Box>
          </ButtonBase>
        ))}
      </Box>
    </Stack>
  )
}
