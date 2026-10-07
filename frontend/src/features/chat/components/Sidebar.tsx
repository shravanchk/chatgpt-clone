import AutoAwesome from '@mui/icons-material/AutoAwesome'
import EditSquare from '@mui/icons-material/EditSquare'
import Search from '@mui/icons-material/Search'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import InputBase from '@mui/material/InputBase'
import List from '@mui/material/List'
import ListSubheader from '@mui/material/ListSubheader'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useAppDispatch } from '../../../app/hooks'
import { groupByRecency } from '../../../lib/dateGroups'
import { useDebouncedValue } from '../../../lib/hooks'
import {
  useDeleteConversationMutation,
  useListConversationsInfiniteQuery,
  useRenameConversationMutation,
} from '../chatApi'
import { exportConversation } from '../chatSlice'
import { ConversationItem } from './ConversationItem'

interface SidebarProps {
  /** Called after navigating (closes the mobile drawer). */
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim(), 300)
  const [notice, setNotice] = useState<string | null>(null)

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useListConversationsInfiniteQuery(term)
  const [renameConversation] = useRenameConversationMutation()
  const [deleteConversation] = useDeleteConversationMutation()

  const conversations = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const groups = useMemo(() => groupByRecency(conversations, (c) => c.updated_at), [conversations])

  const startNewChat = () => {
    navigate('/')
    onNavigate?.()
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id).unwrap()
      if (id === conversationId) navigate('/')
    } catch {
      setNotice('Could not delete the chat. Please try again.')
    }
  }

  const handleExport = async (id: string, format: 'md' | 'json') => {
    const result = await dispatch(exportConversation({ conversationId: id, format }))
    if (exportConversation.rejected.match(result)) setNotice('Export failed. Please try again.')
  }

  return (
    <Stack sx={{ height: '100%', bgcolor: 'background.paper' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 1.5, pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <AutoAwesome fontSize="small" aria-hidden />
          <Typography variant="subtitle1" component="span" sx={{ fontWeight: 600 }}>
            ChatGPT Clone
          </Typography>
        </Stack>
        <Tooltip title="New chat">
          <IconButton aria-label="New chat" onClick={startNewChat}>
            <EditSquare fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ px: 1.5, pb: 1 }}>
        <InputBase
          fullWidth
          placeholder="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputProps={{ 'aria-label': 'Search chats', maxLength: 200 }}
          startAdornment={
            <InputAdornment position="start">
              <Search fontSize="small" />
            </InputAdornment>
          }
          sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: 'action.hover', fontSize: 14 }}
        />
      </Box>

      <Box component="nav" aria-label="Chat history" sx={{ flex: 1, overflowY: 'auto', pb: 2 }}>
        {isLoading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress size={22} aria-label="Loading chats" />
          </Box>
        )}
        {isError && (
          <Alert severity="error" sx={{ mx: 1.5 }}>
            Couldn&apos;t load your chats.
          </Alert>
        )}
        {!isLoading && !isError && conversations.length === 0 && (
          <Typography variant="body2" sx={{ px: 3, py: 2, color: 'text.secondary' }}>
            {term ? `No chats match “${term}”.` : 'No chats yet. Start one!'}
          </Typography>
        )}
        {groups.map(({ group, items }) => (
          <List
            key={group}
            dense
            subheader={
              <ListSubheader sx={{ bgcolor: 'background.paper', lineHeight: '32px', fontSize: 12 }}>
                {group}
              </ListSubheader>
            }
          >
            {items.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                selected={c.id === conversationId}
                onNavigate={onNavigate}
                onRename={(title) => void renameConversation({ id: c.id, title })}
                onDelete={() => void handleDelete(c.id)}
                onExport={(format) => void handleExport(c.id, format)}
              />
            ))}
          </List>
        ))}
        {hasNextPage && (
          <Box sx={{ display: 'grid', placeItems: 'center' }}>
            <Button size="small" color="inherit" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              Show more
            </Button>
          </Box>
        )}
      </Box>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
      />
    </Stack>
  )
}
