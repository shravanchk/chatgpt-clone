import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { authorizedFetch, responseErrorMessage } from '../../app/authorizedFetch'
import type { AppDispatch, RootState } from '../../app/store'
import { parseSse } from '../../lib/sse'
import { chatApi, upsertCachedMessage } from './chatApi'
import type { Action, Message, StreamEvents } from './types'

/**
 * The one in-flight reply. Completed messages live in the RTK Query cache
 * (`getMessages`); this slice only holds what is still arriving.
 */
export interface ChatState {
  status: 'idle' | 'streaming'
  conversationId: string | null
  /** Shown immediately (optimistic), replaced by the server copy on `message_start`. */
  userMessage: Message | null
  assistantMessageId: string | null
  text: string
  actions: Action[]
  /** Last send failure, with the content so the user can retry. */
  error: { conversationId: string; message: string; content: string } | null
}

const initialState: ChatState = {
  status: 'idle',
  conversationId: null,
  userMessage: null,
  assistantMessageId: null,
  text: '',
  actions: [],
  error: null,
}

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    streamRequested(_state, action: PayloadAction<{ conversationId: string; content: string }>) {
      const { conversationId, content } = action.payload
      return {
        ...initialState,
        status: 'streaming',
        conversationId,
        userMessage: {
          id: `pending-${Date.now()}`,
          conversation_id: conversationId,
          role: 'user',
          content,
          metadata: {},
          status: 'complete',
          created_at: new Date().toISOString(),
        },
      }
    },
    streamOpened(state, action: PayloadAction<StreamEvents['message_start']>) {
      state.userMessage = action.payload.user_message
      state.assistantMessageId = action.payload.assistant_message_id
    },
    deltaReceived(state, action: PayloadAction<string>) {
      state.text += action.payload
    },
    actionsReceived(state, action: PayloadAction<Action[]>) {
      state.actions = action.payload
    },
    streamClosed() {
      return initialState
    },
    sendFailed(_state, action: PayloadAction<NonNullable<ChatState['error']>>) {
      return { ...initialState, error: action.payload }
    },
    errorDismissed(state) {
      state.error = null
    },
  },
  selectors: {
    selectChat: (state) => state,
  },
})

export const { errorDismissed } = chatSlice.actions
export const { selectChat } = chatSlice.selectors
const { streamRequested, streamOpened, deltaReceived, actionsReceived, streamClosed, sendFailed } =
  chatSlice.actions

interface ThunkApi {
  dispatch: AppDispatch
  state: RootState
}

/** The assistant message as far as it got, for when the stream ends abnormally. */
function partialAssistant(state: ChatState, status: Message['status']): Message | null {
  if (!state.conversationId || !state.assistantMessageId) return null
  return {
    id: state.assistantMessageId,
    conversation_id: state.conversationId,
    role: 'assistant',
    content: state.text,
    metadata: { actions: state.actions },
    status,
    created_at: new Date().toISOString(),
  }
}

/**
 * Send a message and consume the SSE reply. Abort the returned promise to stop
 * generation; the server saves the partial reply with `status=error`.
 */
export const sendMessage = createAsyncThunk<
  void,
  { conversationId: string; content: string },
  ThunkApi
>('chat/sendMessage', async ({ conversationId, content }, { dispatch, getState, signal }) => {
  dispatch(streamRequested({ conversationId, content }))
  const finishWith = (message: Message | null) => {
    if (message) dispatch(upsertCachedMessage(conversationId, message))
    // The history request for a brand-new chat may still be in flight (so the upsert
    // above had nothing to update) and could land with the server's `streaming`
    // placeholder. Refetching settles the cache on the saved messages.
    dispatch(chatApi.util.invalidateTags([{ type: 'Message', id: conversationId }]))
    dispatch(streamClosed())
  }

  try {
    const response = await authorizedFetch(
      `/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ content }),
        signal,
      },
      { dispatch, getState },
    )
    if (!response.ok || !response.body) {
      const message = await responseErrorMessage(response)
      dispatch(sendFailed({ conversationId, message, content }))
      return
    }

    for await (const { event, data } of parseSse(response.body)) {
      switch (event) {
        case 'message_start': {
          const payload = JSON.parse(data) as StreamEvents['message_start']
          dispatch(streamOpened(payload))
          dispatch(upsertCachedMessage(conversationId, payload.user_message))
          // Title and ordering changed: refresh the sidebar and header.
          dispatch(
            chatApi.util.invalidateTags([
              { type: 'Conversation', id: 'LIST' },
              { type: 'Conversation', id: conversationId },
            ]),
          )
          break
        }
        case 'delta':
          dispatch(deltaReceived((JSON.parse(data) as StreamEvents['delta']).text))
          break
        case 'actions':
          dispatch(actionsReceived((JSON.parse(data) as StreamEvents['actions']).actions))
          break
        case 'message_end':
          finishWith((JSON.parse(data) as StreamEvents['message_end']).message)
          return
        case 'error': {
          const payload = JSON.parse(data) as StreamEvents['error']
          finishWith(partialAssistant(getState().chat, 'error'))
          dispatch(sendFailed({ conversationId, message: payload.message, content }))
          return
        }
      }
    }
    // Stream ended without message_end (connection dropped).
    finishWith(partialAssistant(getState().chat, 'error'))
  } catch {
    if (signal.aborted) {
      finishWith(partialAssistant(getState().chat, 'error')) // user pressed Stop
      return
    }
    finishWith(partialAssistant(getState().chat, 'error'))
    dispatch(
      sendFailed({
        conversationId,
        content,
        message: 'Connection lost while generating the response. Please try again.',
      }),
    )
  }
})

/** Download the conversation as Markdown or JSON. */
export const exportConversation = createAsyncThunk<
  void,
  { conversationId: string; format: 'md' | 'json' },
  ThunkApi
>('chat/export', async ({ conversationId, format }, { dispatch, getState, rejectWithValue }) => {
  const response = await authorizedFetch(
    `/conversations/${conversationId}/export?format=${format}`,
    { method: 'GET' },
    { dispatch, getState },
  )
  if (!response.ok) return rejectWithValue(await responseErrorMessage(response))

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `conversation.${format}`
  const url = URL.createObjectURL(await response.blob())
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  URL.revokeObjectURL(url)
})
