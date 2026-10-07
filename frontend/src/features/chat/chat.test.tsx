import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  authResponse,
  json,
  mockApi,
  renderApp,
  requests,
  signedInDefaults,
  sseResponse,
} from '../../test/utils'
import type { Message } from './types'

const NOW = '2026-10-07T10:00:00Z'
const conversation = { id: 'c1', title: 'New chat', created_at: NOW, updated_at: NOW }

function message(id: string, role: Message['role'], content: string, extra: Partial<Message> = {}): Message {
  return { id, conversation_id: 'c1', role, content, metadata: {}, status: 'complete', created_at: NOW, ...extra }
}

function replyEvents(userText: string, reply: string[], n = 1): [string, unknown][] {
  const assistant = message(`a${n}`, 'assistant', reply.join(''), {
    metadata: { actions: [{ label: 'Show as chart', prompt: 'Show this as a chart' }] },
  })
  return [
    ['message_start', { conversation_id: 'c1', title: 'Show me a table', user_message: message(`u${n}`, 'user', userText), assistant_message_id: `a${n}` }],
    ...reply.map((text): [string, unknown] => ['delta', { text }]),
    ['actions', { actions: assistant.metadata.actions }],
    ['message_end', { message: assistant }],
  ]
}

/**
 * Fake backend for one conversation: persists what it streams, like the real API,
 * so history refetches after a stream return the same messages.
 */
function fakeChatServer(
  reply: (content: string, turn: number, request: Request) => Response | Promise<Response>,
) {
  const history: Message[] = []
  return {
    history,
    handlers: {
      ...signedInDefaults,
      'POST /auth/refresh': () => json(authResponse()),
      'POST /conversations': () => json(conversation, 201),
      'GET /conversations/c1': () => json(conversation),
      'GET /conversations/c1/messages': () => json({ items: history, next_cursor: null }),
      'POST /conversations/c1/messages': async (request: Request) => {
        const { content } = (await request.json()) as { content: string }
        return reply(content, history.filter((m) => m.role === 'user').length + 1, request)
      },
    },
  }
}

/** Stream a full reply and persist both messages. */
function streamedTurn(server: { history: Message[] }, content: string, turn: number, reply: string[]) {
  const events = replyEvents(content, reply, turn)
  const start = events[0]![1] as { user_message: Message }
  const end = events.at(-1)![1] as { message: Message }
  server.history.push(start.user_message, end.message)
  return sseResponse(events)
}

describe('chat', () => {
  it('starts a new chat, streams the reply, and sends a follow-up action', async () => {
    const server = fakeChatServer((content, turn) =>
      streamedTurn(server, content, turn, [
        '| Lang | Typing |\n',
        '|---|---|\n',
        '| Python | Dynamic |\n',
      ]),
    )
    const fetchMock = mockApi(server.handlers)
    const { router } = renderApp('/')
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Show me a table{Enter}')

    // Streamed markdown table is rendered, the URL moved to the new conversation.
    expect(await screen.findByRole('cell', { name: 'Dynamic' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/c/c1')
    expect(screen.getByTestId('user-message')).toHaveTextContent('Show me a table')

    // Follow-up action sends its prompt as the next message.
    await user.click(await screen.findByRole('button', { name: 'Show as chart' }))
    await waitFor(() => expect(requests(fetchMock, 'POST', '/conversations/c1/messages')).toHaveLength(2))
    const second = requests(fetchMock, 'POST', '/conversations/c1/messages')[1]!
    expect(await second.json()).toEqual({ content: 'Show this as a chart' })
    await waitFor(() => expect(screen.getAllByTestId('user-message')).toHaveLength(2))
  })

  it('stops generation and marks the reply as interrupted', async () => {
    const server = fakeChatServer((_content, _turn, request) => {
      // Sends one chunk, then stays open. Like real fetch, aborting the request errors
      // the body; the backend saves the partial reply with status=error.
      const encoder = new TextEncoder()
      const user = message('u1', 'user', 'Tell me a story')
      server.history.push(user, message('a1', 'assistant', '', { status: 'streaming' }))
      const start = { conversation_id: 'c1', title: 'x', user_message: user, assistant_message_id: 'a1' }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(start)}\n\n`))
          controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: 'Once upon a time' })}\n\n`))
          request.signal.addEventListener('abort', () => {
            server.history[1] = message('a1', 'assistant', 'Once upon a time', { status: 'error' })
            controller.error(new DOMException('Aborted', 'AbortError'))
          })
        },
      })
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
    })
    mockApi(server.handlers)
    renderApp('/c/c1')
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Tell me a story{Enter}')
    expect(await screen.findByText('Once upon a time')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stop generating' }))

    const reply = await screen.findByTestId('assistant-message')
    expect(await within(reply).findByText('Response interrupted')).toBeInTheDocument()
    expect(within(reply).getByText('Once upon a time')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('shows the server error and lets the user retry', async () => {
    let attempts = 0
    const server = fakeChatServer((content, turn) => {
      attempts += 1
      return attempts === 1
        ? json({ error: { code: 'rate_limited', message: 'Too many requests, please slow down', details: null } }, 429)
        : streamedTurn(server, content, turn, ['Hi there!'])
    })
    mockApi(server.handlers)
    renderApp('/c/c1')
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'hello{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Hi there!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lists conversations grouped by recency in the sidebar', async () => {
    const today = new Date().toISOString()
    mockApi({
      ...signedInDefaults,
      'POST /auth/refresh': () => json(authResponse()),
      'GET /conversations': () =>
        json({
          items: [
            { id: 'c1', title: 'Fresh chat', created_at: today, updated_at: today },
            { id: 'c2', title: 'Ancient chat', created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' },
          ],
          next_cursor: null,
        }),
      'GET /conversations/c2': () =>
        json({ id: 'c2', title: 'Ancient chat', created_at: NOW, updated_at: NOW }),
      'GET /conversations/c2/messages': () => json({ items: [], next_cursor: null }),
    })
    const { router } = renderApp('/')

    const nav = await screen.findByRole('navigation', { name: 'Chat history' })
    expect(await within(nav).findByText('Fresh chat')).toBeInTheDocument()
    expect(within(nav).getByText('Today')).toBeInTheDocument()
    expect(within(nav).getByText('Older')).toBeInTheDocument()

    await userEvent.click(within(nav).getByRole('link', { name: 'Ancient chat' }))
    expect(router.state.location.pathname).toBe('/c/c2')
  })
})
