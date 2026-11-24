import type { SessionUser } from '../types'
import { classifyAccountResponse, isSessionUser } from './account-outcome'

/**
 * What the UI does with the response of `PUT` or `DELETE /api/profile/photo`:
 * `classifyAccountResponse` with the user as success.
 */
export type ProfileOutcome =
  | { readonly kind: 'saved'; readonly user: SessionUser }
  | { readonly kind: 'rejected'; readonly code: string; readonly message: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed'; readonly status: number }

/**
 * Like `classifyAccountResponse`, except that success is only 200: the photo
 * creates nothing that would answer 201.
 *
 * @param status HTTP status; 0 if there was no response.
 */
export function classifyProfileResponse(status: number, body: unknown): ProfileOutcome {
  if (status === 201) return { kind: 'failed', status }
  const outcome = classifyAccountResponse(status, body, (fields) => (isSessionUser(fields.user) ? fields.user : null))
  switch (outcome.kind) {
    case 'saved':
      return { kind: 'saved', user: outcome.value }
    case 'rejected':
      return { kind: 'rejected', code: outcome.code, message: outcome.message }
    default:
      return outcome
  }
}
