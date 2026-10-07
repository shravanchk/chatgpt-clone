import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AppProviders } from '../app/AppProviders'
import { makeStore } from '../app/store'
import { MarkdownRenderer } from './MarkdownRenderer'

function renderMarkdown(content: string, streaming = false) {
  return render(
    <AppProviders store={makeStore()}>
      <MarkdownRenderer content={content} streaming={streaming} />
    </AppProviders>,
  )
}

const CHART = JSON.stringify({
  type: 'bar',
  title: 'Users by month',
  xKey: 'month',
  series: [{ key: 'web', name: 'Web' }],
  data: [
    { month: 'Jan', web: 42 },
    { month: 'Feb', web: 48 },
  ],
})

describe('MarkdownRenderer', () => {
  it('renders GFM tables', () => {
    renderMarkdown('| Language | Typing |\n|---|---|\n| Python | Dynamic |')

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Language' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'Dynamic' })).toBeInTheDocument()
  })

  it('renders nested lists and task lists', () => {
    renderMarkdown('1. Outer\n   - Inner\n\n- [x] Done\n- [ ] Todo')

    expect(screen.getByText('Inner').closest('ul')?.closest('ol')).not.toBeNull()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, false])
  })

  it('highlights fenced code with a language label and copy button', () => {
    renderMarkdown('```python\nprint("hi")\n```')

    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
    expect(screen.getByText('print')).toBeInTheDocument()
  })

  it('renders ```chart blocks as a chart with an accessible data table', async () => {
    renderMarkdown('```chart\n' + CHART + '\n```')

    expect(await screen.findByRole('img', { name: 'Users by month' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View data' }))
    const table = screen.getByRole('table', { name: 'Users by month data' })
    expect(within(table).getByRole('cell', { name: '48' })).toBeInTheDocument()
  })

  it('shows a placeholder for an incomplete chart while streaming, raw JSON after', async () => {
    const partial = '```chart\n{"type": "bar", "da'
    const { unmount } = renderMarkdown(partial, true)
    expect(await screen.findByLabelText('Drawing chart')).toBeInTheDocument()
    unmount()

    renderMarkdown(partial + '\n```', false)
    expect(await screen.findByText('json')).toBeInTheDocument() // falls back to a code block
  })

  it('renders images with alt text', () => {
    renderMarkdown('![Mountain lake](/static/images/mountain-lake.svg)')

    expect(screen.getByRole('img', { name: 'Mountain lake' })).toHaveAttribute(
      'src',
      '/static/images/mountain-lake.svg',
    )
  })

  it('does not render raw HTML', () => {
    const { container } = renderMarkdown('<script>alert(1)</script><img src=x onerror="alert(1)">')

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('strips javascript: URLs and opens links in a new tab safely', () => {
    renderMarkdown('[bad](javascript:alert(1)) [good](https://example.com)')

    expect(screen.getByText('bad').getAttribute('href') ?? '').not.toContain('javascript')
    const good = screen.getByRole('link', { name: 'good' })
    expect(good).toHaveAttribute('target', '_blank')
    expect(good).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
