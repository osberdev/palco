import { getDatabase, type Queryable } from './client.ts'

/**
 * The user's WhatsApp number. The E.164 form only leaves this module towards the
 * endpoint, which answers with the mask: the full number never leaves the server.
 * The database can be injected to test it in memory.
 */
export interface StoredWhatsapp {
  readonly e164: string
  readonly verified: boolean
  readonly consentedAt: string
}

interface WhatsappRow {
  readonly e164: string
  readonly verified: boolean
  readonly consented_at: string
}

export async function findWhatsapp(userId: number, database: Queryable = getDatabase()): Promise<StoredWhatsapp | null> {
  const { rows } = await database.query<WhatsappRow>('SELECT e164, verified, consented_at FROM whatsapp_numbers WHERE user_id = $1', [userId])
  const row = rows[0]
  return row ? { e164: row.e164, verified: row.verified, consentedAt: row.consented_at } : null
}

/**
 * Inserts or replaces. Changing the number is a new consent (RN-WSP-04), and the
 * new number is not verified.
 */
export async function saveWhatsapp(userId: number, e164: string, database: Queryable = getDatabase()): Promise<void> {
  await database.query(
    `INSERT INTO whatsapp_numbers (user_id, e164) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET e164 = excluded.e164, verified = false, consented_at = now()`,
    [userId, e164],
  )
}

/** Removing it withdraws consent (RF-WSP-04). Without a number it does nothing. */
export async function deleteWhatsapp(userId: number, database: Queryable = getDatabase()): Promise<void> {
  await database.query('DELETE FROM whatsapp_numbers WHERE user_id = $1', [userId])
}
