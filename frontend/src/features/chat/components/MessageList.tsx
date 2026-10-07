import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'

import { useAppSelector } from '../../../app/hooks'
import { MessageBubble } from '../../../components/MessageBubble'
import { flattenMessages, useGetMessagesInfiniteQuery } from '../chatApi'
import { selectChat } from '../chatSlice'
import type { Message } from '../types'
import { ActionButtons } from './ActionButtons'

const STICK_THRESHOLD_PX = 120

interface MessageListProps {
  conversationId: string
  onSend: (prompt: string) => void
}

export function MessageList({ conversationId, onSend }: MessageListProps) {
  const chat = useAppSelector(selectChat)
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useGetMessagesInfiniteQuery(conversationId)

  const isStreamingHere = chat.status === 'streaming' && chat.conversationId === conversationId
  const anyStreaming = chat.status === 'streaming'

  // Cached history + the in-flight turn, de-duplicated by id. The server's placeholder
  // for the reply being streamed is replaced by the live text from the slice.
  const messages = useMemo(() => {
    const cached = flattenMessages(data)
    if (!isStreamingHere) return cached
    const visible = cached.filter((m) => m.id !== chat.assistantMessageId)
    const pending = chat.userMessage
    if (pending && !visible.some((m) => m.id === pending.id)) visible.push(pending)
    return visible
  }, [data, isStreamingHere, chat.assistantMessageId, chat.userMessage])

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const restoreFrom = useRef<{ height: number; top: number } | null>(null)

  // New conversation: start at the bottom.
  useLayoutEffect(() => {
    stickToBottom.current = true
  }, [conversationId])

  // Follow new content while the user is near the bottom; keep position when loading
  // earlier messages above.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (restoreFrom.current) {
      el.scrollTop = el.scrollHeight - restoreFrom.current.height + restoreFrom.current.top
      restoreFrom.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, chat.text])

  // Content can also grow *after* render: lazy-loaded charts, images, code highlighting.
  // Stay pinned to the bottom through those too, unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current && !restoreFrom.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const loadEarlier = async () => {
    const el = scrollRef.current
    if (el) restoreFrom.current = { height: el.scrollHeight, top: el.scrollTop }
    await fetchNextPage()
  }

  return (
    <Box
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
      }}
      sx={{ flex: 1, overflowY: 'auto' }}
    >
      <Stack
        ref={contentRef}
        spacing={4}
        role="log"
        aria-live="polite"
        aria-busy={isStreamingHere}
        sx={{ maxWidth: 768, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}
      >
        {isLoading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
            <CircularProgress size={28} aria-label="Loading messages" />
          </Box>
        )}
        {hasNextPage && (
          <Button
            onClick={() => void loadEarlier()}
            loading={isFetchingNextPage}
            color="inherit"
            size="small"
            sx={{ alignSelf: 'center' }}
          >
            Load earlier messages
          </Button>
        )}
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            actions={
              message.id === lastAssistantId && !anyStreaming ? (
                <ActionButtons actions={message.metadata.actions ?? []} onSelect={onSend} />
              ) : null
            }
          />
        ))}
        {isStreamingHere && (
          <MessageBubble
            role="assistant"
            content={chat.text}
            streaming
            footer={<ActionButtons actions={chat.actions} onSelect={onSend} disabled />}
          />
        )}
      </Stack>
    </Box>
  )
}

function MessageRow({ message, actions }: { message: Message; actions: ReactNode }) {
  return (
    <MessageBubble
      role={message.role}
      content={message.content}
      // A placeholder still `streaming` on the server belongs to another tab/session.
      streaming={message.status === 'streaming'}
      interrupted={message.role === 'assistant' && message.status === 'error'}
      footer={actions}
    />
  )
}
