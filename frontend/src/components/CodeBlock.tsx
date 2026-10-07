import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Highlight, Prism, themes } from 'prism-react-renderer'

import { useIsDarkMode } from '../lib/hooks'
import { CopyButton } from './CopyButton'

const ALIASES: Record<string, string> = { sh: 'bash', shell: 'bash', zsh: 'bash' }

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const isDark = useIsDarkMode()
  const label = language ?? 'text'
  const grammar = ALIASES[label] ?? label
  // Unknown languages render as plain text rather than failing.
  const prismLanguage = grammar in Prism.languages ? grammar : 'plain'

  return (
    <Box
      sx={{
        my: 2,
        borderRadius: 2,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
        bgcolor: isDark ? '#1e1e1e' : '#f6f8fa',
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          pl: 2,
          pr: 0.5,
          py: 0.25,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          {label}
        </Typography>
        <CopyButton text={code} label="Copy code" />
      </Stack>
      <Highlight theme={isDark ? themes.vsDark : themes.vsLight} code={code} language={prismLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              overflowX: 'auto',
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            }}
          >
            <code>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, j) => (
                    <span key={j} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </code>
          </Box>
        )}
      </Highlight>
    </Box>
  )
}
