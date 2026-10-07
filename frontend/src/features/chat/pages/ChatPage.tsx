import Menu from '@mui/icons-material/Menu'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useNavigate, useParams } from 'react-router'

import { useAppDispatch, useAppSelector } from '../../../app/hooks'
import { ThemeModeToggle } from '../../../components/ThemeModeToggle'
import { getErrorMessage } from '../../../lib/apiError'
import { selectCurrentUser } from '../../auth/authSlice'
import { UserMenu } from '../../auth/components/UserMenu'
import { effectiveModel, useGetModelsQuery, useGetSettingsQuery } from '../../settings/settingsApi'
import { useCreateConversationMutation, useGetConversationQuery } from '../chatApi'
import { errorDismissed, selectChat } from '../chatSlice'
import { Composer } from '../components/Composer'
import { EmptyState } from '../components/EmptyState'
import { MessageList } from '../components/MessageList'
import { useChatLayout } from '../useChatLayout'

/** A conversation thread, or the "new chat" screen when there is no id in the URL. */
export function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { send, stop, openSidebar } = useChatLayout()
  const user = useAppSelector(selectCurrentUser)
  const chat = useAppSelector(selectChat)
  const { data: settings } = useGetSettingsQuery()
  const { data: models } = useGetModelsQuery()
  const { data: conversation, isError: notFound } = useGetConversationQuery(conversationId ?? '', {
    skip: !conversationId,
  })
  const [createConversation, { error: createError }] = useCreateConversationMutation()

  const streamingHere = chat.status === 'streaming' && chat.conversationId === conversationId
  const error = chat.error && chat.error.conversationId === conversationId ? chat.error : null

  const handleSend = async (content: string) => {
    dispatch(errorDismissed())
    if (conversationId) {
      send(conversationId, content)
      return
    }
    // New chat: create the conversation, start streaming, then move to its URL.
    try {
      const created = await createConversation().unwrap()
      send(created.id, content)
      navigate(`/c/${created.id}`)
    } catch {
      // shown below via createError
    }
  }

  const title = conversationId ? (conversation?.title ?? '') : 'New chat'

  return (
    <>
      <Stack
        component="header"
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 1,
          borderBottom: 1,
          // Colour per breakpoint: a responsive `borderBottom` shorthand would reset it.
          borderBottomColor: { xs: 'divider', md: 'transparent' },
        }}
      >
        <IconButton aria-label="Open sidebar" onClick={openSidebar} sx={{ display: { md: 'none' } }}>
          <Menu />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, px: { md: 1 } }}>
          <Typography variant="subtitle1" component="h1" noWrap sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {settings && models && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Model: {effectiveModel(settings, models)}
              {models.provider === 'mock' && ' (offline demo)'}
            </Typography>
          )}
        </Box>
        <ThemeModeToggle />
        <UserMenu />
      </Stack>

      {conversationId && notFound ? (
        <Stack spacing={2} sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', px: 2 }}>
          <Typography variant="h6" component="p">
            This chat doesn&apos;t exist or was deleted.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/')}>
            Start a new chat
          </Button>
        </Stack>
      ) : conversationId ? (
        <MessageList key={conversationId} conversationId={conversationId} onSend={(p) => void handleSend(p)} />
      ) : (
        <EmptyState
          greeting={user ? `What can I help with, ${user.display_name}?` : 'What can I help with?'}
          onPick={(p) => void handleSend(p)}
          disabled={chat.status === 'streaming'}
        />
      )}

      {(error || createError) && (
        <Box sx={{ px: 2, maxWidth: 800, width: '100%', mx: 'auto' }}>
          <Alert
            severity="error"
            onClose={() => dispatch(errorDismissed())}
            action={
              error ? (
                <Button color="inherit" size="small" onClick={() => void handleSend(error.content)}>
                  Retry
                </Button>
              ) : undefined
            }
          >
            {error ? error.message : getErrorMessage(createError)}
          </Alert>
        </Box>
      )}

      <Composer
        key={conversationId ?? 'new'}
        autoFocus
        onSend={(content) => void handleSend(content)}
        onStop={stop}
        streaming={streamingHere}
        disabled={chat.status === 'streaming'}
      />
    </>
  )
}
