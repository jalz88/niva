// Normalizes every Postgres/PostgREST error into the shape described in
// docs/10-api-data-access-spec.md §3. Components only ever see a NivaError —
// they never inspect a raw Postgres error code or SQLSTATE value.

export type NivaErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'permission_denied'
  | 'conflict'
  | 'network_error'
  | 'unknown_error'

export interface NivaError {
  code: NivaErrorCode
  message: string
  field?: string
  retryable: boolean
}

interface PostgrestLikeError {
  code?: string
  message?: string
  details?: string | null
}

/**
 * Maps a Supabase/PostgREST error (or a thrown network error) to a
 * NivaError. Postgres error codes referenced here:
 * - 23505 unique_violation
 * - 23514 check_violation
 * - 42501 insufficient_privilege (RLS denial)
 * - PGRST116 no rows found (PostgREST "not found" for .single())
 */
export function toNivaError(error: unknown): NivaError {
  if (error instanceof TypeError || (error instanceof Error && error.message === 'Failed to fetch')) {
    return {
      code: 'network_error',
      message: "We couldn't reach the server. Check your connection and try again.",
      retryable: true,
    }
  }

  const pgError = error as PostgrestLikeError
  const code = pgError?.code

  if (code === '23505') {
    return { code: 'validation_error', message: 'That value is already in use.', retryable: false }
  }
  if (code === '23514') {
    return {
      code: 'validation_error',
      message: 'That value is not allowed here. Check the amount, type, and category match.',
      retryable: false,
    }
  }
  if (code === '42501') {
    return {
      code: 'permission_denied',
      message: "You don't have permission to do that. Refresh and try again.",
      retryable: false,
    }
  }
  if (code === 'PGRST116') {
    return { code: 'not_found', message: 'That record no longer exists.', retryable: false }
  }

  return {
    code: 'unknown_error',
    message: 'Something went wrong on our end. Try again.',
    retryable: true,
  }
}

/** Raised by update() calls when the optimistic-concurrency check fails. */
export function conflictError(): NivaError {
  return {
    code: 'conflict',
    message: 'This was changed since you opened it. Reload to see the latest version.',
    retryable: false,
  }
}
