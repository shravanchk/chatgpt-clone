import Check from '@mui/icons-material/Check'
import ContentCopy from '@mui/icons-material/ContentCopy'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'

import { useCopyToClipboard } from '../lib/hooks'

interface CopyButtonProps {
  text: string
  label?: string
}

export function CopyButton({ text, label = 'Copy' }: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <Tooltip title={copied ? 'Copied!' : label}>
      <IconButton size="small" aria-label={copied ? 'Copied' : label} onClick={() => void copy(text)}>
        {copied ? <Check fontSize="inherit" /> : <ContentCopy fontSize="inherit" />}
      </IconButton>
    </Tooltip>
  )
}
