import { describe, expect, it } from 'vitest'

import { parseSse, type SseEvent } from './sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const events: SseEvent[] = []
  for await (const event of parseSse(streamOf(chunks))) events.push(event)
  return events
}

describe('parseSse', () => {
  it('parses named events with CRLF endings (sse-starlette format)', async () => {
    const events = await collect([
      'event: delta\r\ndata: {"text":"Hel"}\r\n\r\nevent: delta\r\ndata: {"text":"lo"}\r\n\r\n',
    ])

    expect(events).toEqual([
      { event: 'delta', data: '{"text":"Hel"}' },
      { event: 'delta', data: '{"text":"lo"}' },
    ])
  })

  it('reassembles events split at arbitrary chunk boundaries, including mid-CRLF', async () => {
    const wire = 'event: a\r\ndata: one\r\n\r\nevent: b\r\ndata: two\r\n\r\n'
    // Every possible split point, so a boundary lands between \r and \n at least once.
    for (let i = 1; i < wire.length; i++) {
      expect(await collect([wire.slice(0, i), wire.slice(i)])).toEqual([
        { event: 'a', data: 'one' },
        { event: 'b', data: 'two' },
      ])
    }
  })

  it('joins multi-line data, defaults the event name and ignores comments', async () => {
    const events = await collect([': ping\n\ndata: line 1\ndata: line 2\n\n'])

    expect(events).toEqual([{ event: 'message', data: 'line 1\nline 2' }])
  })

  it('emits a final event even without a trailing blank line', async () => {
    expect(await collect(['event: end\ndata: {}'])).toEqual([{ event: 'end', data: '{}' }])
  })

  it('handles multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('data: héllo 🙂\n\n')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    })
    const events: SseEvent[] = []
    for await (const event of parseSse(stream)) events.push(event)

    expect(events).toEqual([{ event: 'message', data: 'héllo 🙂' }])
  })
})
