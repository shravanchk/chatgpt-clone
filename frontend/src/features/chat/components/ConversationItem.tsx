import DataObject from '@mui/icons-material/DataObject'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'

import type { Conversation } from '../types'

interface ConversationItemProps {
  conversation: Conversation
  selected: boolean
  onRename: (title: string) => void
  onDelete: () => void
  onExport: (format: 'md' | 'json') => void
  onNavigate?: () => void
}

export function ConversationItem({
  conversation,
  selected,
  onRename,
  onDelete,
  onExport,
  onNavigate,
}: ConversationItemProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conversation.title)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const closeMenu = () => setMenuAnchor(null)
  const commitRename = () => {
    const title = draft.trim()
    setEditing(false)
    if (title && title !== conversation.title) onRename(title)
    else setDraft(conversation.title)
  }

  if (editing) {
    return (
      <ListItem sx={{ px: 1, py: 0.25 }}>
        <InputBase
          autoFocus
          fullWidth
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setDraft(conversation.title)
              setEditing(false)
            }
          }}
          inputProps={{ maxLength: 200, 'aria-label': 'Conversation title' }}
          sx={{ px: 1.5, py: 0.5, borderRadius: 2, border: 1, borderColor: 'primary.main', fontSize: 14 }}
        />
      </ListItem>
    )
  }

  return (
    <>
      <ListItem
        disablePadding
        secondaryAction={
          <IconButton
            edge="end"
            size="small"
            aria-label={`Options for ${conversation.title}`}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            className="item-options"
            sx={{ opacity: selected || menuAnchor ? 1 : 0 }}
          >
            <MoreHoriz fontSize="small" />
          </IconButton>
        }
        sx={{
          px: 1,
          '&:hover .item-options, & .item-options:focus-visible': { opacity: 1 },
        }}
      >
        <ListItemButton
          component={RouterLink}
          to={`/c/${conversation.id}`}
          selected={selected}
          onClick={onNavigate}
          sx={{ borderRadius: 2, py: 0.75, pr: 5 }}
        >
          <ListItemText
            primary={conversation.title}
            slotProps={{ primary: { noWrap: true, sx: { fontSize: 14 } } }}
          />
        </ListItemButton>
      </ListItem>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            closeMenu()
            setDraft(conversation.title)
            setEditing(true)
          }}
        >
          <ListItemIcon>
            <EditOutlined fontSize="small" />
          </ListItemIcon>
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu()
            onExport('md')
          }}
        >
          <ListItemIcon>
            <DescriptionOutlined fontSize="small" />
          </ListItemIcon>
          Export as Markdown
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu()
            onExport('json')
          }}
        >
          <ListItemIcon>
            <DataObject fontSize="small" />
          </ListItemIcon>
          Export as JSON
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            closeMenu()
            setConfirmDelete(true)
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlined fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete chat?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete <strong>{conversation.title}</strong>.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmDelete(false)
              onDelete()
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
