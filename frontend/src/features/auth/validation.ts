/** Client-side checks mirror the backend rules for instant feedback; the server stays authoritative. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Email is required'
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address'
  return undefined
}

export function validateNewPassword(password: string): string | undefined {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (new TextEncoder().encode(password).length > 72) return 'Password is too long'
  return undefined
}

export function validateRequired(value: string, label: string): string | undefined {
  return value.trim() ? undefined : `${label} is required`
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean)
}
