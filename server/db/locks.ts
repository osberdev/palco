import type { Queryable } from './client.ts'

/**
 * Application locks: advisory and transaction-scoped, so COMMIT or ROLLBACK
 * releases them. Advisory rather than row locks because `FOR NO KEY UPDATE`
 * requires UPDATE, and `palco_app` has no UPDATE on `venues` or `users`. The whole
 * application uses this single mechanism.
 *
 * Global order: venue (1), folio (2), user (3). A purchase takes the first two and
 * an account change only the user lock, so no path combines them today. If one
 * ever does, this order prevents deadlocks.
 *
 * A `hashtext` collision between two venues only over-serializes, never
 * under-serializes. These locks are local to each database: the `palco_test_*`
 * databases do not interfere with `palco`.
 */

/** Serializes a venue's purchases: availability and the limit are read under it. */
export const VENUE_LOCK_SPACE = 1
/** Serializes the folio counter: no other purchase may read `MAX(sequence) + 1`. */
export const FOLIO_LOCK_SPACE = 2
export const FOLIO_LOCK_KEY = 0

/** Serializes a user's account: the limit, duplicates and daily additions (RN-MET-01, 06, 10). */
export const USER_LOCK_SPACE = 3

export async function lockVenue(tx: Queryable, venueId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock($1::int, hashtext($2::text))', [VENUE_LOCK_SPACE, venueId])
}

export async function lockFolio(tx: Queryable): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [FOLIO_LOCK_SPACE, FOLIO_LOCK_KEY])
}

export async function lockUser(tx: Queryable, userId: number): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [USER_LOCK_SPACE, userId])
}
