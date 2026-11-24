import { randomUUID } from 'node:crypto'
import type { CardBrand, SavedPaymentMethod, SavedPaymentMethodData } from '../../types'
import { getDatabase, type Queryable } from './client'
import { requireIsoDate } from './iso-date.ts'

interface PaymentMethodRow {
  readonly id: string
  readonly method: 'debit' | 'credit' | 'paypal'
  readonly brand: CardBrand | null
  readonly last4: string | null
  readonly holder: string | null
  readonly expiry: string | null
  readonly email: string | null
}

const COLUMNS = 'SELECT id, method, brand, last4, holder, expiry, email FROM payment_methods'

function toSavedMethod(row: PaymentMethodRow): SavedPaymentMethod {
  if (row.method === 'paypal') return { id: row.id, method: 'paypal', email: row.email ?? '' }
  return {
    id: row.id,
    method: row.method,
    brand: row.brand ?? 'visa',
    last4: row.last4 ?? '',
    holder: row.holder ?? '',
    expiry: row.expiry ?? '',
  }
}

/** The data columns; those of the other shape are NULL, as the CHECK requires. */
function toColumns(data: SavedPaymentMethodData): readonly (string | null)[] {
  return data.method === 'paypal'
    ? [data.method, null, null, null, null, data.email]
    : [data.method, data.brand, data.last4, data.holder, data.expiry, null]
}

/** The user's methods, most recent first (RN-MET-03). */
export async function listPaymentMethods(userId: number, database: Queryable = getDatabase()): Promise<SavedPaymentMethod[]> {
  const { rows } = await database.query<PaymentMethodRow>(`${COLUMNS} WHERE user_id = $1 ORDER BY position DESC`, [userId])
  return rows.map(toSavedMethod)
}

/** One of the user's methods; another user's or a missing one is `null` (RN-SEG-01). */
export async function findPaymentMethod(userId: number, id: string, database: Queryable = getDatabase()): Promise<SavedPaymentMethod | null> {
  const { rows } = await database.query<PaymentMethodRow>(`${COLUMNS} WHERE user_id = $1 AND id = $2`, [userId, id])
  return rows[0] ? toSavedMethod(rows[0]) : null
}

/** The user's additions on `isoDate` (RN-MET-10), even if some were removed. */
export async function countAdditionsOn(userId: number, isoDate: string, database: Queryable = getDatabase()): Promise<number> {
  const day = requireIsoDate(isoDate)
  const { rows } = await database.query<{ readonly n: number }>(
    'SELECT count(*) AS n FROM payment_method_additions WHERE user_id = $1 AND added_on = $2',
    [userId, day],
  )
  return rows[0]?.n ?? 0
}

// The three writes take `tx`, with no default connection: they run in the
// caller's transaction, under the user lock, consistent with what it read.

/**
 * The `id` is random: it neither reveals how many methods exist nor lets anyone
 * guess them. The method is stored and the day's addition recorded (RN-MET-10);
 * additions from earlier days are no longer needed and are deleted, so the table
 * does not grow without bound.
 */
export async function insertPaymentMethod(userId: number, data: SavedPaymentMethodData, addedOn: string, tx: Queryable): Promise<SavedPaymentMethod> {
  const id = randomUUID()
  const day = requireIsoDate(addedOn)
  await tx.query('DELETE FROM payment_method_additions WHERE user_id = $1 AND added_on < $2', [userId, day])
  await tx.query(
    `INSERT INTO payment_methods (id, user_id, method, brand, last4, holder, expiry, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, ...toColumns(data)],
  )
  await tx.query('INSERT INTO payment_method_additions (user_id, added_on) VALUES ($1, $2)', [userId, day])
  return { id, ...data }
}

export async function updatePaymentMethod(userId: number, id: string, data: SavedPaymentMethodData, tx: Queryable): Promise<SavedPaymentMethod> {
  await tx.query(
    `UPDATE payment_methods
     SET method = $3, brand = $4, last4 = $5, holder = $6, expiry = $7, email = $8
     WHERE user_id = $1 AND id = $2`,
    [userId, id, ...toColumns(data)],
  )
  return { id, ...data }
}

export async function deletePaymentMethod(userId: number, id: string, tx: Queryable): Promise<void> {
  await tx.query('DELETE FROM payment_methods WHERE user_id = $1 AND id = $2', [userId, id])
}
