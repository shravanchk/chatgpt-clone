import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { authResponse, defaultSettings, json, mockApi, renderApp, signedInDefaults } from '../../test/utils'

describe('SettingsDialog', () => {
  it('keeps unsaved edits when the theme is changed, then saves only changed fields', async () => {
    let settings = { ...defaultSettings }
    const patches: unknown[] = []
    mockApi({
      ...signedInDefaults,
      'POST /auth/refresh': () => json(authResponse()),
      'GET /models': () =>
        json({ provider: 'anthropic', models: ['mock', 'claude-haiku-4-5'], default: 'mock' }),
      'GET /users/me/settings': () => json(settings),
      'PATCH /users/me/settings': async (request) => {
        const body = (await request.json()) as Partial<typeof settings>
        patches.push(body)
        settings = { ...settings, ...body, updated_at: new Date().toISOString() }
        return json(settings)
      },
    })
    renderApp('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog')
    const prompt = within(dialog).getByLabelText(/custom instructions/i)
    await user.type(prompt, 'Answer concisely.')

    await user.click(within(dialog).getByRole('button', { name: 'Dark' }))

    expect(await within(dialog).findByLabelText(/custom instructions/i)).toHaveValue(
      'Answer concisely.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(patches).toEqual([{ theme: 'dark' }, { system_prompt: 'Answer concisely.' }])
  })
})
