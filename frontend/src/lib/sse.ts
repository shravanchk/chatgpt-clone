/**
 * Minimal Server-Sent Events parser for a `fetch` response body.
 *
 * `EventSource` only supports GET, but sending a message is a POST with a JSON body
 * and an Authorization header, so we read the stream ourselves. Implements the parts
 * of the SSE spec the backend uses: `event:` and (multi-line) `data:` fields, blank-line
 * dispatch, `:` comments (pings) ignored, and LF / CRLF / CR line endings - including a
 * CRLF split across two network chunks.
 */
export interface SseEvent {
  event: string
  data: string
}

class SseLineParser {
  private eventName = ''
  private dataLines: string[] = []

  /** Feed one line (without its terminator); returns an event on a blank line. */
  line(line: string): SseEvent | null {
    if (line === '') return this.dispatch()
    if (line.startsWith(':')) return null // comment / keep-alive ping

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') this.eventName = value
    else if (field === 'data') this.dataLines.push(value)
    return null
  }

  dispatch(): SseEvent | null {
    const event = this.dataLines.length
      ? { event: this.eventName || 'message', data: this.dataLines.join('\n') }
      : null
    this.eventName = ''
    this.dataLines = []
    return event
  }
}

export async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseLineParser()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break

      // `stream: true` keeps a multi-byte character split across chunks intact.
      let text = buffer + decoder.decode(value, { stream: true })
      // A trailing CR may be the first half of a CRLF: wait for the next chunk.
      const heldCr = text.endsWith('\r')
      if (heldCr) text = text.slice(0, -1)

      const lines = text.split(/\r\n|\r|\n/)
      buffer = (lines.pop() ?? '') + (heldCr ? '\r' : '')
      for (const line of lines) {
        const event = parser.line(line)
        if (event) yield event
      }
    }

    // End of stream: finish any unterminated line, then any pending event.
    for (const line of (buffer + decoder.decode()).split(/\r\n|\r|\n/)) {
      const event = parser.line(line)
      if (event) yield event
    }
    const last = parser.dispatch()
    if (last) yield last
  } finally {
    reader.releaseLock()
  }
}
