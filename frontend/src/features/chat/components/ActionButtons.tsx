import SubdirectoryArrowRight from '@mui/icons-material/SubdirectoryArrowRight'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'

import type { Action } from '../types'

interface ActionButtonsProps {
  actions: Action[]
  onSelect: (prompt: string) => void
  disabled?: boolean
}

/** Follow-up suggestions from the assistant; choosing one sends its prompt. */
export function ActionButtons({ actions, onSelect, disabled = false }: ActionButtonsProps) {
  if (actions.length === 0) return null

  return (
    <Stack
      direction="row"
      role="group"
      aria-label="Suggested follow-ups"
      sx={{ flexWrap: 'wrap', gap: 1, mt: 1.5 }}
    >
      {actions.map((action) => {
        const button = (
          <Button
            key={action.label}
            variant="outlined"
            size="small"
            color="inherit"
            disabled={disabled}
            startIcon={<SubdirectoryArrowRight fontSize="small" />}
            onClick={() => onSelect(action.prompt)}
            sx={{ borderRadius: 5, borderColor: 'divider', color: 'text.secondary' }}
          >
            {action.label}
          </Button>
        )
        // `describeChild`: the full prompt is a description; the visible label stays the
        // accessible name. Disabled buttons get no tooltip (they can't be hovered).
        return disabled ? (
          button
        ) : (
          <Tooltip key={action.label} title={action.prompt} describeChild>
            {button}
          </Tooltip>
        )
      })}
    </Stack>
  )
}
