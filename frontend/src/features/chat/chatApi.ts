import type { InfiniteData } from '@reduxjs/toolkit/query'

import { api } from '../../app/api'
import type { Conversation, ConversationPage, Message, MessagePage } from './types'

type MessagesData = InfiniteData<MessagePage, string | null>

export const chatApi = api.injectEndpoints({
  endpoints: (build) => ({
    /** Sidebar list; the query arg is the search term ('' for none). */
    listConversations: build.infiniteQuery<ConversationPage, string, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.next_cursor,
      },
      query: ({ queryArg: search, pageParam }) => ({
        url: '/conversations',
        params: {
          ...(search ? { search } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
      providesTags: [{ type: 'Conversation', id: 'LIST' }],
    }),
    getConversation: build.query<Conversation, string>({
      query: (id) => `/conversations/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Conversation', id }],
    }),
    createConversation: build.mutation<Conversation, void>({
      query: () => ({ url: '/conversations', method: 'POST', body: {} }),
      invalidatesTags: [{ type: 'Conversation', id: 'LIST' }],
    }),
    renameConversation: build.mutation<Conversation, { id: string; title: string }>({
      query: ({ id, title }) => ({ url: `/conversations/${id}`, method: 'PATCH', body: { title } }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Conversation', id },
        { type: 'Conversation', id: 'LIST' },
      ],
    }),
    deleteConversation: build.mutation<void, string>({
      query: (id) => ({ url: `/conversations/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Conversation', id },
        { type: 'Conversation', id: 'LIST' },
      ],
    }),
    /** History: page 0 is the newest messages; later pages walk back in time. */
    getMessages: build.infiniteQuery<MessagePage, string, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.next_cursor,
      },
      query: ({ queryArg: conversationId, pageParam }) => ({
        url: `/conversations/${conversationId}/messages`,
        params: pageParam ? { cursor: pageParam } : undefined,
      }),
      providesTags: (_result, _error, id) => [{ type: 'Message', id }],
    }),
  }),
})

export const {
  useListConversationsInfiniteQuery,
  useGetConversationQuery,
  useCreateConversationMutation,
  useRenameConversationMutation,
  useDeleteConversationMutation,
  useGetMessagesInfiniteQuery,
} = chatApi

/** Messages oldest → newest across all loaded pages. */
export function flattenMessages(data: MessagesData | undefined): Message[] {
  if (!data) return []
  return data.pages.toReversed().flatMap((page) => page.items)
}

/** Insert or replace a message in the cached history (used while streaming). */
export function upsertCachedMessage(conversationId: string, message: Message) {
  return chatApi.util.updateQueryData('getMessages', conversationId, (draft) => {
    for (const page of draft.pages) {
      const index = page.items.findIndex((m) => m.id === message.id)
      if (index !== -1) {
        page.items[index] = message
        return
      }
    }
    draft.pages[0]?.items.push(message)
  })
}
