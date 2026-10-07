import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import type { SxProps, Theme } from '@mui/material/styles'
import { Children, isValidElement, lazy, memo, Suspense, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { CodeBlock } from './CodeBlock'

// Recharts is the heaviest dependency; load it only when a reply contains a chart.
const ChartBlock = lazy(() => import('./ChartBlock').then((m) => ({ default: m.ChartBlock })))

interface MarkdownRendererProps {
  content: string
  /** True while the text is still arriving (lets partial charts show a placeholder). */
  streaming?: boolean
}

/**
 * Renders assistant Markdown (GFM: tables, task lists, strikethrough).
 *
 * Safe by default: raw HTML is not rendered (no rehype-raw) and react-markdown's URL
 * transform drops `javascript:` and other unsafe link/image targets.
 * Fenced ```chart blocks become Recharts charts; other fences get syntax highlighting.
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  streaming = false,
}: MarkdownRendererProps) {
  const components = useMemo(() => buildComponents(streaming), [streaming])

  return (
    <Box sx={markdownSx}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </Box>
  )
})

function buildComponents(streaming: boolean): Components {
  return {
    pre({ children }) {
      const child = Children.toArray(children)[0]
      if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
        return <pre>{children}</pre>
      }
      const language = /language-([\w+-]+)/.exec(child.props.className ?? '')?.[1]
      const code = String(child.props.children ?? '').replace(/\n$/, '')
      if (language === 'chart') {
        return (
          <Suspense fallback={<Skeleton variant="rounded" height={300} sx={{ my: 2 }} />}>
            <ChartBlock source={code} streaming={streaming} />
          </Suspense>
        )
      }
      return <CodeBlock code={code} language={language} />
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    },
    table({ children }) {
      return (
        <Box sx={{ overflowX: 'auto', my: 2 }}>
          <table>{children}</table>
        </Box>
      )
    },
    img({ src, alt }) {
      return <Box component="img" src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} loading="lazy" />
    },
  }
}

const markdownSx: SxProps<Theme> = {
  fontSize: 16,
  lineHeight: 1.7,
  overflowWrap: 'anywhere',
  '& > :first-of-type': { mt: 0 },
  '& > :last-child': { mb: 0 },
  '& p': { my: 1.5 },
  '& h1, & h2, & h3, & h4': { mt: 3, mb: 1, lineHeight: 1.3, fontWeight: 600 },
  '& h1': { fontSize: '1.6rem' },
  '& h2': { fontSize: '1.35rem' },
  '& h3': { fontSize: '1.15rem' },
  '& ul, & ol': { pl: 3, my: 1.5 },
  '& li': { my: 0.5 },
  '& li > ul, & li > ol': { my: 0.5 },
  '& .contains-task-list': { listStyle: 'none', pl: 1 },
  '& blockquote': {
    m: 0,
    my: 2,
    pl: 2,
    borderLeft: 4,
    borderColor: 'divider',
    color: 'text.secondary',
  },
  '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 3 },
  '& a': { color: 'secondary.main' },
  '& :not(pre) > code': {
    px: 0.75,
    py: 0.25,
    borderRadius: 1,
    bgcolor: 'action.hover',
    fontSize: '0.875em',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  '& table': { borderCollapse: 'collapse', width: '100%', fontSize: 14 },
  '& th, & td': {
    border: 1,
    borderColor: 'divider',
    px: 1.5,
    py: 1,
    textAlign: 'left',
    overflowWrap: 'normal', // the root's `anywhere` would split words letter by letter
    minWidth: 80,
  },
  '& th': { bgcolor: 'action.hover', fontWeight: 600 },
  '& img': { maxWidth: '100%', height: 'auto', borderRadius: 2, display: 'block', my: 2 },
}
