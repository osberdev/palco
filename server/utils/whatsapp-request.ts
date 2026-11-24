import type { WhatsappRegistrationInput } from '../domain/whatsapp'
import { isPlainRecord } from './shape'

/**
 * The PUT /api/profile/whatsapp body, or null if it is not exactly
 * `{ country, number, consent }`: two texts and a boolean. The recipient number is
 * never taken from another key (RN-ENV-01).
 */
export function parseWhatsappBody(body: unknown): WhatsappRegistrationInput | null {
  if (!isPlainRecord(body) || Object.keys(body).length !== 3) return null
  const { country, number, consent } = body
  return typeof country === 'string' && typeof number === 'string' && typeof consent === 'boolean'
    ? { country, number, consent }
    : null
}
