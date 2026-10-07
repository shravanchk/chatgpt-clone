import { useCallback, useMemo, useRef } from 'react'

import { useAppDispatch } from '../../app/hooks'
import { sendMessage } from './chatSlice'

/**
 * Start and stop streamed replies. Owned by the chat layout so an in-flight stream
 * (and its Stop button) survives navigating from "/" to the new conversation's URL.
 */
export function useChatStream() {
  const dispatch = useAppDispatch()
  const inFlight = useRef<{ abort: () => void } | null>(null)

  const send = useCallback(
    (conversationId: string, content: string) => {
      const request = dispatch(sendMessage({ conversationId, content }))
      inFlight.current = request
      void request.finally(() => {
        if (inFlight.current === request) inFlight.current = null
      })
    },
    [dispatch],
  )

  const stop = useCallback(() => inFlight.current?.abort(), [])

  return useMemo(() => ({ send, stop }), [send, stop])
}

export type ChatStream = ReturnType<typeof useChatStream>
