import { useOutletContext } from 'react-router'

import type { ChatStream } from './useChatStream'

export interface ChatLayoutContext extends ChatStream {
  openSidebar: () => void
}

/** Stream controls and sidebar toggle provided by <ChatLayout> to the thread page. */
export function useChatLayout(): ChatLayoutContext {
  return useOutletContext<ChatLayoutContext>()
}
