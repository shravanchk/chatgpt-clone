import { Navigate, type RouteObject } from 'react-router'

import { ChatPage } from '../features/chat/pages/ChatPage'
import { LoginPage } from '../features/auth/pages/LoginPage'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <ChatPage /> },
  { path: '/c/:conversationId', element: <ChatPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]
