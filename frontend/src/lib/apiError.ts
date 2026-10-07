import type { SerializedError } from '@reduxjs/toolkit'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

/** The backend's error envelope: `{"error": {code, message, details}}`. */
export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown }
}

interface ValidationIssue {
  loc: (string | number)[]
  msg: string
}

function isApiErrorBody(data: unknown): data is ApiErrorBody {
  if (typeof data !== 'object' || data === null || !('error' in data)) return false
  const { error } = data
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

function isFetchError(error: unknown): error is FetchBaseQueryError {
  return typeof error === 'object' && error !== null && 'status' in error
}

export function getApiError(error: unknown): ApiErrorBody['error'] | null {
  if (isFetchError(error) && isApiErrorBody(error.data)) return error.data.error
  return null
}

/** A human-readable message for any RTK Query / thrown error. */
export function getErrorMessage(error: FetchBaseQueryError | SerializedError | unknown): string {
  const apiError = getApiError(error)
  if (apiError) return apiError.message
  if (isFetchError(error) && error.status === 'FETCH_ERROR') {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/** Map 422 validation details to `{fieldName: message}` for form helper text. */
export function getFieldErrors(error: unknown): Record<string, string> {
  const apiError = getApiError(error)
  if (apiError?.code !== 'validation_error' || !Array.isArray(apiError.details)) return {}

  const fields: Record<string, string> = {}
  for (const issue of apiError.details as ValidationIssue[]) {
    const field = issue.loc.at(-1)
    if (typeof field === 'string' && !(field in fields)) {
      fields[field] = issue.msg.replace(/^Value error, /, '')
    }
  }
  return fields
}
