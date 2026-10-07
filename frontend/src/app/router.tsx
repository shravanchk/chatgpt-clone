import { Navigate, type RouteObject } from 'react-router'

import { GuestOnly, RequireAuth, SessionGate } from '../features/auth/components/RouteGuards'

// Route-level code splitting: auth pages and the chat app load as separate chunks.
const lazyRoute = (load: () => Promise<{ Component: React.ComponentType }>) => ({ lazy: load })

export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          {
            path: '/login',
            ...lazyRoute(() =>
              import('../features/auth/pages/LoginPage').then((m) => ({ Component: m.LoginPage })),
            ),
          },
          {
            path: '/register',
            ...lazyRoute(() =>
              import('../features/auth/pages/RegisterPage').then((m) => ({
                Component: m.RegisterPage,
              })),
            ),
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            ...lazyRoute(() =>
              import('../features/chat/pages/ChatLayout').then((m) => ({ Component: m.ChatLayout })),
            ),
            children: [
              {
                path: '/',
                ...lazyRoute(() =>
                  import('../features/chat/pages/ChatPage').then((m) => ({ Component: m.ChatPage })),
                ),
              },
              {
                path: '/c/:conversationId',
                ...lazyRoute(() =>
                  import('../features/chat/pages/ChatPage').then((m) => ({ Component: m.ChatPage })),
                ),
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
