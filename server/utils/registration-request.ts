import type { RegistrationInput } from '../domain/registration'
import { isPlainRecord } from './shape'

/**
 * The shape of the `POST /api/auth/register` body, or null: exactly `username`,
 * `displayName`, `email`, `password` and `passwordConfirmation`, all text; `email`
 * may be `''`, the optional email. It is as strict as the saved methods `PATCH`:
 * an extra key would not be stored, and answering 201 would tell the client it was.
 */
export function parseRegistrationBody(body: unknown): RegistrationInput | null {
  if (!isPlainRecord(body) || Object.keys(body).length !== 5) return null
  const { username, displayName, email, password, passwordConfirmation } = body
  if (
    typeof username !== 'string'
    || typeof displayName !== 'string'
    || typeof email !== 'string'
    || typeof password !== 'string'
    || typeof passwordConfirmation !== 'string'
  ) return null
  return { username, displayName, email, password, passwordConfirmation }
}
