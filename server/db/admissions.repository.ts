import { getDatabase, type Queryable } from './client.ts'

/**
 * Gate admissions (RN-ACC-04): one per ticket.
 *
 * `admitTicket` is a single statement and needs no transaction: the primary key
 * decides. Under READ COMMITTED, a second concurrent INSERT of the same ticket waits
 * for the first on the unique index and then inserts nothing. Reading the earlier
 * time is another statement, with another snapshot, so it sees the committed row.
 *
 * The time is read as seconds since the epoch: `timestamptz` arrives as text in UTC
 * (C15). With no row, because the ticket does not exist, it returns null.
 */
export type Admission =
  | { readonly admitted: true, readonly at: Date }
  | { readonly admitted: false, readonly at: Date }

/** The foreign key to `tickets`: the ticket no longer exists. */
function isMissingTicket(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503'
}

export async function admitTicket(ticketId: string, at: Date, database: Queryable = getDatabase()): Promise<Admission | null> {
  let inserted
  try {
    inserted = await database.query<{ readonly epoch: number }>(
      `INSERT INTO admissions (ticket_id, admitted_at) VALUES ($1, $2)
       ON CONFLICT (ticket_id) DO NOTHING
       RETURNING EXTRACT(EPOCH FROM admitted_at)::bigint AS epoch`,
      [ticketId, at.toISOString()],
    )
  }
  catch (error) {
    // Deleted after it was found, for example by `db:reset`: it does not exist.
    if (isMissingTicket(error)) return null
    throw error
  }
  if (inserted.rows[0]) return { admitted: true, at: new Date(Number(inserted.rows[0].epoch) * 1000) }

  const previous = await database.query<{ readonly epoch: number }>(
    'SELECT EXTRACT(EPOCH FROM admitted_at)::bigint AS epoch FROM admissions WHERE ticket_id = $1',
    [ticketId],
  )
  // No row: the ticket was deleted between the two statements, for example by
  // `db:reset`. The caller answers that it does not exist, never with a 500.
  return previous.rows[0] ? { admitted: false, at: new Date(Number(previous.rows[0].epoch) * 1000) } : null
}
