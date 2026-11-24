import { randomBytes, randomUUID } from 'node:crypto'
import { CATEGORIES, VENUES } from '../server/data/catalog.ts'
import type { Queryable } from '../server/db/client.ts'
import type { PurchaseRecord } from '../server/db/purchases.repository.ts'
import { nextSequence, purchasedQuantity } from '../server/db/purchases.repository.ts'
import { remainingUserLimit } from '../server/domain/booking.ts'
import { confirmPurchase, type TicketsInput } from '../server/domain/confirmation.ts'
import { parseDate } from '../server/domain/input.ts'
import type { PaymentInput } from '../server/domain/payment.ts'
import { TICKET_ID_BYTES, encodeBase32, issueTickets } from '../server/domain/ticket.ts'
import { purchaseFingerprint } from '../server/utils/purchase-request.ts'
import { formatIsoDate } from '../utils/date.ts'
import type { CalendarDate } from '../types/index.ts'

/**
 * The sample purchases, in a separate module so that `db:seed:demo` and the
 * `db:evidence` tests seed the same thing. Each one goes through `confirmPurchase`,
 * the endpoint's composite.
 *
 * Each card holder is a synthetic person different from the buyer: that way
 * `db:evidence` can check that it never prints holders without confusing them
 * with the user's name, which it does print.
 */

const CARD_EXPIRY = '12/28'

function card(method: 'debit' | 'credit', cardNumber: string, holder: string): PaymentInput {
  return { method, cardNumber, holder, expiry: CARD_EXPIRY, securityCode: '123', email: '' }
}

function paypal(email: string): PaymentInput {
  return { method: 'paypal', cardNumber: '', holder: '', expiry: '', securityCode: '', email }
}

export interface DemoPurchase {
  readonly username: string
  readonly venueId: string
  readonly tickets: TicketsInput
  readonly payment: PaymentInput
}

// The four synthetic seed users, with test cards that pass Luhn. The PayPal
// accounts are on example.com and differ from the seed users' emails: db:evidence
// prints the user's email and never the PayPal account, and an identical string
// could not be told apart (EV7).
export const DEMO_PURCHASES: readonly DemoPurchase[] = [
  {
    username: 'RIVA030315MJCSLNA2JC',
    venueId: 'teatro-colon',
    tickets: { category: 'teatro', input: { playIndex: 1, sectionIndex: 1, date: '04/12/2026', time: '19:00', quantity: '2' } },
    payment: card('credit', '4111111111111111', 'Elena Vela Torres'),
  },
  {
    username: 'TENB010908HCMLVRA6CM',
    venueId: 'cinepolis',
    tickets: { category: 'cine', input: { filmIndex: 1, age: '30', formatId: 'tradicional', date: '05/12/2026', time: '20:00', quantity: '3', seats: ['20', '21', '22'] } },
    payment: card('debit', '5555555555554444', 'Marco Nava Orozco'),
  },
  {
    username: 'IASC951122MQTBLR02QT',
    venueId: 'louvre',
    tickets: { category: 'museo', input: { isResident: false, date: '09/12/2026', time: '18:30', quantity: '2' } },
    payment: paypal('paypal.carmen@example.com'),
  },
  {
    username: 'MEXD980704HNLNXG10NL',
    venueId: 'mna',
    tickets: { category: 'museo', input: { isResident: true, date: '10/12/2026', time: '11:00', quantity: '4' } },
    payment: card('credit', '5105105105105100', 'Raúl Ortiz Campos'),
  },
  {
    username: 'RIVA030315MJCSLNA2JC',
    venueId: 'met',
    tickets: { category: 'museo', input: { isResident: false, date: '11/12/2026', time: '19:00', quantity: '1' } },
    payment: paypal('paypal.ana@example.com'),
  },
]

export type DemoRecords =
  | { readonly ok: true, readonly records: readonly PurchaseRecord[] }
  | { readonly ok: false, readonly message: string }

/**
 * The purchases ready for `insertPurchase`, with the counters that follow the
 * database's. It writes nothing. The event dates are fixed: if `today` has passed
 * them, the domain rejects them and the message says so.
 */
export async function demoRecords(
  database: Queryable,
  today: CalendarDate,
  ticketId: () => Uint8Array = () => new Uint8Array(randomBytes(TICKET_ID_BYTES)),
): Promise<DemoRecords> {
  const records: PurchaseRecord[] = []
  let sequence = await nextSequence(database)

  for (const demo of DEMO_PURCHASES) {
    const { rows } = await database.query<{ readonly id: number }>('SELECT id FROM users WHERE username = $1', [demo.username])
    const user = rows[0]
    if (!user) return { ok: false, message: `No existe el usuario ${demo.username}. Corre bun run db:seed primero.` }
    const venue = VENUES.find((candidate) => candidate.id === demo.venueId)
    if (!venue) return { ok: false, message: `Recinto inexistente: ${demo.venueId}` }
    // The same cumulative limit as the endpoint (RN-CAN-07): what is in the database
    // and what this seeding run has not written yet.
    const categoryLimit = CATEGORIES.find((category) => category.slug === venue.category)?.maxTickets ?? 0
    const eventDate = parseDate(demo.tickets.input.date)
    const eventDateIso = eventDate.ok ? formatIsoDate(eventDate.value) : ''
    const pending = records
      .filter((stored) => stored.userId === user.id && stored.purchase.venueId === venue.id && formatIsoDate(stored.purchase.date) === eventDateIso)
      .reduce((sum, stored) => sum + stored.purchase.quantity, 0)
    const remaining = remainingUserLimit(categoryLimit, (eventDate.ok ? await purchasedQuantity(user.id, venue.id, eventDateIso, database) : 0) + pending)
    const userLimit = remaining.ok ? remaining.value : 0

    const confirmation = confirmPurchase(venue, demo.tickets, demo.payment, { userLimit, available: venue.capacity, today, sequence })
    if (!confirmation.ok) {
      return { ok: false, message: `La compra de ${demo.venueId} no es válida hoy: ${confirmation.result.code} (${confirmation.result.message}).` }
    }
    const issued = issueTickets(confirmation.purchase.quantity, Array.from({ length: confirmation.purchase.quantity }, ticketId))
    if (!issued.ok) return { ok: false, message: 'No se pudieron emitir los boletos' }

    records.push({
      userId: user.id,
      sequence,
      requestId: randomUUID(),
      fingerprint: purchaseFingerprint(venue.id, demo.tickets, demo.payment),
      purchase: confirmation.purchase,
      ticketIds: issued.value.map(encodeBase32),
    })
    sequence += 1
  }
  return { ok: true, records }
}
