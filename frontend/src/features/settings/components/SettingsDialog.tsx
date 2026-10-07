import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { getErrorMessage } from '../../../lib/apiError'
import {
  useGetModelsQuery,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  type SettingsUpdate,
  type ThemePreference,
  type ModelsResponse,
  type UserSettings,
  effectiveModel,
} from '../settingsApi'
import { useThemePreference } from '../useThemePreference'

const SYSTEM_PROMPT_MAX = 4000

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { data: settings } = useGetSettingsQuery(undefined, { skip: !open })
  const { data: models } = useGetModelsQuery(undefined, { skip: !open })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Settings</DialogTitle>
      {!settings || !models ? (
        <DialogContent sx={{ display: 'grid', placeItems: 'center', minHeight: 200 }}>
          <CircularProgress size={28} />
        </DialogContent>
      ) : (
        // Dialog unmounts its content when closed, so the form re-initialises on each open.
        // Don't key on `updated_at`: saving the theme would reset unsaved edits.
        <SettingsForm settings={settings} models={models} onClose={onClose} />
      )}
    </Dialog>
  )
}

interface SettingsFormProps {
  settings: UserSettings
  models: ModelsResponse
  onClose: () => void
}

function SettingsForm({ settings, models, onClose }: SettingsFormProps) {
  const { theme, setTheme } = useThemePreference()
  const [updateSettings, { isLoading: isSaving, error }] = useUpdateSettingsMutation()
  // Start from the model replies actually use (a stored choice may not be offered).
  const [model, setModel] = useState(effectiveModel(settings, models))
  const [systemPrompt, setSystemPrompt] = useState(settings.system_prompt ?? '')

  const handleSave = async () => {
    const changes: SettingsUpdate = {}
    if (model !== settings.model) changes.model = model
    const prompt = systemPrompt.trim() || null
    if (prompt !== settings.system_prompt) changes.system_prompt = prompt
    if (Object.keys(changes).length > 0) {
      try {
        await updateSettings(changes).unwrap()
      } catch {
        return // error is shown from mutation state
      }
    }
    onClose()
  }

  return (
    <>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}

          <Stack spacing={1}>
            <Typography variant="subtitle2" component="h3">
              Theme
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={theme}
              onChange={(_e, value: ThemePreference | null) => value && setTheme(value)}
              aria-label="Theme"
            >
              <ToggleButton value="light">Light</ToggleButton>
              <ToggleButton value="dark">Dark</ToggleButton>
              <ToggleButton value="system">System</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <TextField
            select
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            helperText="Used for new responses"
          >
            {models.models.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Custom instructions (system prompt)"
            placeholder="How would you like the assistant to respond?"
            multiline
            minRows={4}
            maxRows={10}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            slotProps={{ htmlInput: { maxLength: SYSTEM_PROMPT_MAX } }}
            helperText={`${systemPrompt.length} / ${SYSTEM_PROMPT_MAX}`}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} loading={isSaving}>
          Save
        </Button>
      </DialogActions>
    </>
  )
}
