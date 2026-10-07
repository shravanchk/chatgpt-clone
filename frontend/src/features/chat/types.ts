export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ConversationPage {
  items: Conversation[]
  next_cursor: string | null
}

export interface Action {
  label: string
  prompt: string
}

export interface MessageMetadata {
  actions?: Action[]
}

export type MessageStatus = 'complete' | 'streaming' | 'error'

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: MessageMetadata
  status: MessageStatus
  created_at: string
}

export interface MessagePage {
  /** Oldest first within the page. */
  items: Message[]
  next_cursor: string | null
}

/** Payloads of the SSE events sent by POST /conversations/{id}/messages. */
export interface StreamEvents {
  message_start: {
    conversation_id: string
    title: string
    user_message: Message
    assistant_message_id: string
  }
  delta: { text: string }
  actions: { actions: Action[] }
  message_end: { message: Message }
  error: { code: string; message: string; assistant_message_id: string }
}
