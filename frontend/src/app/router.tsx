import { Navigate, type RouteObject } from 'react-router'

import { GuestOnly, RequireAuth, SessionGate } from '../features/auth/components/RouteGuards'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RegisterPage } from '../features/auth/pages/RegisterPage'
import { ChatPage } from '../features/chat/pages/ChatPage'

export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <ChatPage /> },
          { path: '/c/:conversationId', element: <ChatPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
