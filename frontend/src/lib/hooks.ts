import { useColorScheme } from '@mui/material/styles'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Whether the *effective* scheme is dark (resolves `system` to the OS preference). */
export function useIsDarkMode(): boolean {
  const { mode, systemMode } = useColorScheme()
  return (mode === 'system' ? systemMode : mode) === 'dark'
}

/** `copy(text)` writes to the clipboard; `copied` stays true for ~2s afterwards. */
export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), resetMs)
      } catch {
        setCopied(false) // clipboard blocked (e.g. insecure context); nothing to show
      }
    },
    [resetMs],
  )

  return { copied, copy }
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
