import { deriveAvailability, parseAvailabilityOverrides } from '../server/data/availability.ts'
import type { Queryable } from '../server/db/client.ts'
import { soldByVenue } from '../server/db/purchases.repository.ts'
import { cents } from '../server/domain/money.ts'
import { decodeBase32, formatShortCode, TICKET_ID_BYTES } from '../server/domain/ticket.ts'
import type { Currency, ExceptionPolicy, Venue } from '../types/index.ts'
import { formatMoney } from '../utils/format.ts'

/**
 * The `bun run db:evidence` report: read from the database without writing
 * anything. Each section names the requirements it supports. It never prints a
 * full hash, a card holder, a PayPal email or the WhatsApp number: it runs as
 * `palco_lector`, which cannot read it, and only says whether there is one.
 *
 * It is a function over the database so it can be tested with PGlite (EV1 to
 * EV4); the script only connects, prints and exits with 1 if any consistency check
 * fails.
 */

export interface EvidenceReport {
  readonly text: string
  /** One line per failing consistency check, with the purchase or the venue. */
  readonly failures: readonly string[]
}

/** The exit code of `bun run db:evidence`: 1 if any check fails (EV3). */
export function evidenceExitCode(report: EvidenceReport): number {
  return report.failures.length === 0 ? 0 : 1
}

function table(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const cells = [headers, ...rows.map((row) => row.map(String))]
  const widths = headers.map((_, column) => Math.max(...cells.map((row) => [...(row[column] ?? '')].length)))
  const line = (row: readonly string[]) => row.map((cell, column) => cell + ' '.repeat(widths[column]! - [...cell].length)).join('  ').trimEnd()
  return [line(cells[0]!), widths.map((width) => '─'.repeat(width)).join('  '), ...cells.slice(1).map(line)].join('\n')
}

/** `YYYY-MM-DD HH:MM:SS` in the process time zone. */
function localStamp(date: Date): string {
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

function shortCodeOf(id: string): string {
  const bytes = decodeBase32(id, TICKET_ID_BYTES)
  const code = bytes.ok ? formatShortCode(bytes.value) : null
  return code?.ok ? code.value : 'id mal formado'
}

interface AdmissionRow {
  readonly id: string
  readonly folio: string
  readonly ordinal: number
  readonly quantity: number
  readonly venue_name: string
  readonly event_date: string
  readonly epoch: number
}

function section(title: string, backs?: string): string {
  return `\n━━ ${title}${backs ? ` · ${backs}` : ''}\n`
}

interface UserRow {
  readonly id: number
  readonly display_name: string
  readonly email: string | null
  readonly username: string
  readonly password_hash: string
  readonly purchases: number
  readonly has_whatsapp: boolean
}

/** From the `payments` view, with the venue and the event date from `purchases`. */
interface PaymentRow {
  readonly folio: string
  readonly user_id: number
  readonly method: string
  readonly brand: string | null
  readonly amount_cents: number
  readonly currency: Currency
  readonly status: string
  readonly paid_on: string
  readonly venue_name: string
  readonly event_date: string
  readonly event_time: string
}

/** From the `purchase_history` view. */
interface HistoryRow {
  readonly user_id: number
  readonly display_name: string
  readonly folio: string
  readonly venue_name: string
  readonly event_date: string
  readonly event_time: string
  readonly quantity: number
  readonly total_cents: number
  readonly currency: Currency
}

interface PurchaseTicketsRow {
  readonly folio: string
  readonly quantity: number
  readonly tickets: number
}

/**
 * Domains reserved for testing (RFC 2606 and 6761): nobody receives mail there.
 * An email on another domain may be a real person's mailbox, even if the name is
 * synthetic, so it is not printed.
 */
const RESERVED_EMAIL_DOMAINS = ['example.com', 'example.net', 'example.org']
const RESERVED_EMAIL_TLDS = ['test', 'example', 'invalid', 'localhost']

export function displayedEmail(email: string | null): string {
  if (email === null || email === '') return '—'
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  const reserved = RESERVED_EMAIL_DOMAINS.includes(domain) || RESERVED_EMAIL_TLDS.includes(domain.slice(domain.lastIndexOf('.') + 1))
  return reserved ? email : 'registrado (dominio no reservado, oculto)'
}

const METHOD_NAMES: Readonly<Record<string, string>> = { debit: 'débito', credit: 'crédito', paypal: 'PayPal' }
const BRAND_NAMES: Readonly<Record<string, string>> = { visa: 'Visa', mastercard: 'Mastercard' }

/**
 * What each policy does according to the domain rule (`applicableHours` and
 * `evaluateOpeningDay`), not what a particular venue does. It is a complete
 * `Record`: a new policy without a description does not compile.
 */
export const POLICY_DESCRIPTIONS: Readonly<Record<ExceptionPolicy, string>> = {
  CLOSES_ON_HOLIDAY: 'cierra en los festivos de su jurisdicción',
  OPENS_ON_HOLIDAY: 'abre en un festivo aunque caiga en su día de cierre',
  OPENS_LAST_SUNDAY: 'abre el último domingo del mes aunque cierre los domingos',
  SEASONAL_HOURS: 'horario alterno de mayo a septiembre',
  WEEKEND_HOURS: 'horario alterno los viernes y sábados',
  NIGHT_HOURS: 'horario alterno los miércoles y viernes',
  SUNDAY_HOLIDAY_HOURS: 'horario reducido los domingos y festivos',
}

/** The policies that use the alternate hours, and the Sunday and holiday one. */
const ALTERNATE_POLICIES: readonly string[] = ['SEASONAL_HOURS', 'WEEKEND_HOURS', 'NIGHT_HOURS']

/** The event fields and where they live. */
const EVENT_FIELDS: readonly (readonly [string, string, string])[] = [
  ['tipo', 'sí', 'venues.category: teatro, cine o museo'],
  ['ubicación', 'sí', 'venues.city y venues.jurisdiction'],
  ['capacidad', 'sí', 'venues.capacity'],
  ['horarios', 'sí', 'venues.opens y venues.closes, venue_hours, venue_closed_weekdays, venue_exceptions y venue_annual_closures'],
  ['precios', 'sí', 'venue_prices: secciones, formatos, tarifas y cargo por servicio, en centavos'],
  ['restricciones', 'sí', 'venues.restrictions'],
  ['cartelera', 'sí', 'venue_plays y venue_films; cada compra guarda además la suya en purchases.details'],
]

export async function evidenceReport(database: Queryable, venues: readonly Venue[], overridesText = ''): Promise<EvidenceReport> {
  const out: string[] = []
  const failures: string[] = []

  out.push('PALCO · Evidencia de la base de datos (solo lectura)')
  const server = (await database.query<{ readonly version: string }>("SELECT current_setting('server_version') AS version")).rows[0]!
  out.push(`Servidor: PostgreSQL ${server.version}`)

  // ── Users ───────────────────────────────────────────────────────────────
  const users = (await database.query<UserRow>(
    `SELECT u.id, u.display_name, u.email, u.username, u.password_hash,
            (SELECT COUNT(*) FROM purchases p WHERE p.user_id = u.id) AS purchases,
            EXISTS (SELECT 1 FROM whatsapp_numbers w WHERE w.user_id = u.id) AS has_whatsapp
     FROM users u ORDER BY u.id`,
  )).rows
  out.push(section('Usuarios y su historial de compras'))
  out.push(table(
    ['id', 'nombre', 'correo', 'CURP (usuario)', 'hash', 'longitud', 'costo', 'compras', 'WhatsApp'],
    users.map((user) => {
      // Only the algorithm prefix and the cost: the full hash is never printed.
      const prefix = user.password_hash.slice(0, 7)
      const cost = Number(user.password_hash.slice(4, 6))
      return [user.id, user.display_name, displayedEmail(user.email), user.username, `${prefix}…`, user.password_hash.length, cost, user.purchases, user.has_whatsapp ? 'sí' : 'no']
    }),
  ))
  out.push('Contraseñas con bcrypt: se muestra el prefijo, la longitud (60) y el costo, nunca el hash (RNF-14).')
  out.push('Correo: solo si es de un dominio reservado para pruebas; «—» si el registro no lo pidió (RN-REG-06).')

  // The history comes from the view: users and purchases joined by the database.
  const history = (await database.query<HistoryRow>(
    `SELECT user_id, display_name, folio, venue_name, event_date, event_time, quantity, total_cents, currency
     FROM purchase_history ORDER BY user_id, folio`,
  )).rows
  out.push('\nHistorial de compras por usuario (vista purchase_history):')
  out.push(table(
    ['usuario', 'nombre', 'folio', 'recinto', 'evento', 'cantidad', 'total'],
    history.map((row) => [
      row.user_id,
      row.display_name,
      row.folio,
      row.venue_name,
      `${row.event_date} ${row.event_time}`,
      row.quantity,
      formatMoney(cents(row.total_cents), row.currency),
    ]),
  ))
  const withoutHistory = users.filter((user) => !history.some((row) => row.user_id === user.id))
  out.push(`Usuarios sin compras, con el historial vacío: ${withoutHistory.length === 0 ? 'ninguno' : withoutHistory.map((user) => user.id).join(', ')}.`)

  // ── Events / venues ─────────────────────────────────────────────────────
  const venueRows = (await database.query<{ id: string, category: string, name: string, city: string, capacity: number, opens: string, closes: string, restrictions: string }>(
    'SELECT id, category, name, city, capacity, opens, closes, restrictions FROM venues ORDER BY category, id',
  )).rows
  const prices = (await database.query<{ venue_id: string, kind: string, label: string, price_cents: number }>(
    'SELECT venue_id, kind, label, price_cents FROM venue_prices ORDER BY venue_id, kind, price_cents DESC, label',
  )).rows
  const currencyOf = new Map(venues.map((venue) => [venue.id, venue.currency]))
  out.push(section('Eventos: recintos, capacidad, horario general y precios'))
  out.push(table(
    ['id', 'tipo', 'nombre', 'ciudad', 'capacidad', 'horario general'],
    venueRows.map((venue) => [venue.id, venue.category, venue.name, venue.city, venue.capacity, `${venue.opens}–${venue.closes}`]),
  ))
  out.push('\nPrecios por recinto (venue_prices):')
  for (const venue of venueRows) {
    const currency = currencyOf.get(venue.id)
    const own = prices.filter((price) => price.venue_id === venue.id)
      .map((price) => `${price.label === price.kind ? price.kind : price.label} ${currency ? formatMoney(cents(price.price_cents), currency) : price.price_cents}`)
    out.push(`  ${venue.id}: ${own.join(' · ')}`)
  }
  out.push('\nRestricciones por recinto (venues.restrictions):')
  for (const venue of venueRows) out.push(`  ${venue.id}: ${venue.restrictions}`)
  out.push('\nCampos de «Eventos» del enunciado en la base:')
  out.push(table(['campo', 'en la base', 'dónde'], EVENT_FIELDS))

  // The server reads the venue schedule and listings from here.
  const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const hoursRows = (await database.query<{ venue_id: string, kind: string, opens: string, closes: string }>(
    'SELECT venue_id, kind, opens, closes FROM venue_hours ORDER BY venue_id COLLATE "C", kind COLLATE "C"',
  )).rows
  const weekdayRows = (await database.query<{ venue_id: string, weekday: number }>(
    'SELECT venue_id, weekday FROM venue_closed_weekdays ORDER BY venue_id COLLATE "C", weekday',
  )).rows
  const exceptionRows = (await database.query<{ venue_id: string, policy: string }>(
    'SELECT venue_id, policy FROM venue_exceptions ORDER BY venue_id COLLATE "C", policy COLLATE "C"',
  )).rows
  const closureRows = (await database.query<{ venue_id: string, month: number, day: number, name: string }>(
    'SELECT venue_id, month, day, name FROM venue_annual_closures ORDER BY venue_id COLLATE "C", month, day',
  )).rows
  const playRows = (await database.query<{ venue_id: string, title: string }>(
    'SELECT venue_id, title FROM venue_plays ORDER BY venue_id COLLATE "C", position',
  )).rows
  const filmRows = (await database.query<{ venue_id: string, title: string, classification: string, duration_minutes: number }>(
    'SELECT venue_id, title, classification, duration_minutes FROM venue_films ORDER BY venue_id COLLATE "C", position',
  )).rows
  out.push(section('Eventos: horarios, cierres y cartelera'))
  for (const venue of venueRows) {
    const own = <R extends { venue_id: string }>(list: readonly R[]) => list.filter((row) => row.venue_id === venue.id)
    const policies = own(exceptionRows).map((row) => row.policy)
    // A schedule is only shown if one of the venue's policies uses it: otherwise the
    // database repeats the general one, and showing it would suggest the venue opens
    // with it that day.
    const hoursOf = (kind: string, used: boolean) => (used
      ? own(hoursRows).filter((row) => row.kind === kind).map((row) => `${row.opens}–${row.closes}`).join('') || '—'
      : '—')
    const alternate = hoursOf('alternate', policies.some((policy) => ALTERNATE_POLICIES.includes(policy)))
    const sunday = hoursOf('sunday_holiday', policies.includes('SUNDAY_HOLIDAY_HOURS'))
    const closedDays = own(weekdayRows).map((row) => WEEKDAYS[row.weekday] ?? String(row.weekday)).join(', ')
    const closed = closedDays === '' ? 'sin cierre semanal' : `cierra ${closedDays}`
    const exceptions = policies.map((policy) => {
      const description = (POLICY_DESCRIPTIONS as Readonly<Record<string, string>>)[policy]
      return description ? `${policy} (${description})` : policy
    }).join(', ') || 'ninguna'
    const closures = own(closureRows).map((row) => `${row.day}/${row.month} ${row.name}`).join(' · ') || 'ninguno'
    out.push(`  ${venue.id}: alterno ${alternate} · domingo y festivos ${sunday} · ${closed}`)
    out.push(`    excepciones: ${exceptions} · cierres anuales: ${closures}`)
    const plays = own(playRows).map((row) => row.title)
    const films = own(filmRows).map((row) => `${row.title} (${row.classification}, ${row.duration_minutes} min)`)
    if (plays.length > 0) out.push(`    obras: ${plays.join(' · ')}`)
    if (films.length > 0) out.push(`    películas: ${films.join(' · ')}`)
  }

  // ── Payments and transactions ───────────────────────────────────────────
  // The payment comes from the `payments` view; from `purchases`, only the venue and
  // the event date.
  const payments = (await database.query<PaymentRow>(
    `SELECT y.folio, y.user_id, y.method, y.brand, y.amount_cents, y.currency, y.status, y.paid_on,
            p.venue_name, p.event_date, p.event_time
     FROM payments y JOIN purchases p ON p.folio = y.folio
     ORDER BY p.sequence`,
  )).rows
  out.push(section('Pagos y transacciones'))
  out.push(table(
    ['folio', 'usuario', 'recinto', 'evento', 'método', 'marca', 'monto', 'estado', 'pagado'],
    payments.map((payment) => [
      payment.folio,
      payment.user_id,
      payment.venue_name,
      `${payment.event_date} ${payment.event_time}`,
      METHOD_NAMES[payment.method] ?? payment.method,
      payment.brand === null ? '—' : BRAND_NAMES[payment.brand] ?? payment.brand,
      formatMoney(cents(payment.amount_cents), payment.currency),
      payment.status,
      payment.paid_on,
    ]),
  ))
  out.push('La vista payments expone el método y la marca: nunca el titular, el correo ni el número enmascarado.')

  // ── Tickets ─────────────────────────────────────────────────────────────
  const tickets = (await database.query<{ folio: string, id: string, ordinal: number }>(
    'SELECT folio, id, ordinal FROM tickets ORDER BY folio, ordinal',
  )).rows
  const purchases = (await database.query<PurchaseTicketsRow>(
    `SELECT p.folio, p.quantity, (SELECT COUNT(*) FROM tickets t WHERE t.folio = p.folio) AS tickets
     FROM purchases p ORDER BY p.sequence`,
  )).rows
  out.push(section('Boletos: un código único por boleto'))
  for (const purchase of purchases) {
    const own = tickets.filter((ticket) => ticket.folio === purchase.folio).map((ticket) => shortCodeOf(ticket.id))
    out.push(`  ${purchase.folio}: ${own.length} ${own.length === 1 ? 'boleto' : 'boletos'} · ${own.join(', ')}`)
  }
  const distinct = new Set(tickets.map((ticket) => ticket.id)).size
  out.push(`Códigos distintos: ${distinct} de ${tickets.length}.`)

  // ── Admissions ──────────────────────────────────────────────────────────
  // The time arrives as seconds since the epoch and is shown in this process's time
  // zone: that of the gate computer, which is the one that decided to admit.
  const admissions = (await database.query<AdmissionRow>(
    `SELECT t.id, t.folio, t.ordinal, p.quantity, p.venue_name, p.event_date,
            extract(epoch FROM a.admitted_at)::float8 AS epoch
     FROM admissions a JOIN tickets t ON t.id = a.ticket_id JOIN purchases p ON p.folio = t.folio
     ORDER BY a.admitted_at, t.folio, t.ordinal`,
  )).rows
  out.push(section('Ingresos: cada boleto entra una vez, en su fecha', 'RN-ACC-03 y 04'))
  const admittedOn = (row: AdmissionRow) => localStamp(new Date(row.epoch * 1000))
  out.push(admissions.length === 0
    ? 'Sin ingresos.'
    : table(
        ['folio', 'boleto', 'código', 'recinto', 'evento', 'ingreso'],
        admissions.map((row) => [row.folio, `${row.ordinal} de ${row.quantity}`, shortCodeOf(row.id), row.venue_name, row.event_date, admittedOn(row)]),
      ))

  // ── Consistency ─────────────────────────────────────────────────────────
  out.push(section('Consistencia'))
  for (const purchase of purchases) {
    if (purchase.tickets !== purchase.quantity) {
      failures.push(`${purchase.folio}: cantidad ${purchase.quantity}, boletos ${purchase.tickets}`)
    }
  }
  out.push(`Compras con cantidad igual a sus boletos: ${purchases.length - purchases.filter((p) => p.tickets !== p.quantity).length} de ${purchases.length}`)

  // RN-ACC-03: the gate only admits on the event date. The primary key of
  // `admissions` guarantees there are no repeats.
  const offDate = admissions.filter((row) => admittedOn(row).slice(0, 10) !== row.event_date)
  for (const row of offDate) {
    failures.push(`${row.folio}, boleto ${row.ordinal} de ${row.quantity} (${shortCodeOf(row.id)}): ingreso el ${admittedOn(row).slice(0, 10)}, el evento es el ${row.event_date}`)
  }
  out.push(`Ingresos en la fecha de su evento: ${admissions.length - offDate.length} de ${admissions.length}`)

  // The views against their tables: one payment per purchase, with its amount, and
  // each user's history matching what they bought.
  const paymentRows = (await database.query<{ folio: string, rows: number, total_cents: number, amount_cents: number | null }>(
    `SELECT p.folio, p.total_cents,
            (SELECT COUNT(*) FROM payments y WHERE y.folio = p.folio) AS rows,
            (SELECT y.amount_cents FROM payments y WHERE y.folio = p.folio) AS amount_cents
     FROM purchases p ORDER BY p.sequence`,
  )).rows
  const strayPayments = (await database.query<{ folio: string }>(
    'SELECT y.folio FROM payments y WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.folio = y.folio)',
  )).rows
  for (const row of paymentRows) {
    if (row.rows !== 1) failures.push(`${row.folio}: ${row.rows} filas en payments, se espera 1`)
    else if (row.amount_cents !== row.total_cents) failures.push(`${row.folio}: payments.amount_cents ${row.amount_cents}, purchases.total_cents ${row.total_cents}`)
  }
  for (const row of strayPayments) failures.push(`${row.folio}: fila en payments sin compra`)
  const singlePayment = paymentRows.filter((row) => row.rows === 1).length
  const sameAmount = paymentRows.filter((row) => row.rows === 1 && row.amount_cents === row.total_cents).length
  out.push(`Compras con exactamente una fila en payments: ${singlePayment} de ${paymentRows.length}`)
  out.push(`Pagos con el monto de su compra (amount_cents = total_cents): ${sameAmount} de ${paymentRows.length}`)

  const quantities = (await database.query<{ id: number, display_name: string, history: number, purchased: number }>(
    `SELECT u.id, u.display_name,
            (SELECT COALESCE(SUM(h.quantity), 0) FROM purchase_history h WHERE h.user_id = u.id) AS history,
            (SELECT COALESCE(SUM(p.quantity), 0) FROM purchases p WHERE p.user_id = u.id) AS purchased
     FROM users u ORDER BY u.id`,
  )).rows
  for (const row of quantities) {
    if (row.history !== row.purchased) {
      failures.push(`usuario ${row.id} (${row.display_name}): ${row.history} boletos en purchase_history, ${row.purchased} en purchases`)
    }
  }
  out.push(`Usuarios con el mismo total de boletos en purchase_history y en purchases: ${quantities.filter((row) => row.history === row.purchased).length} de ${quantities.length}`)

  const parsed = parseAvailabilityOverrides(overridesText, venues)
  const overrides = parsed.ok ? parsed.overrides : new Map<string, number>()
  const sold = await soldByVenue(database)
  const derived = deriveAvailability(venues, overrides, sold)
  const capacityRows = (await database.query<{ id: string, capacity: number, sold: number }>(
    'SELECT v.id, v.capacity, COALESCE(SUM(p.quantity), 0) AS sold FROM venues v LEFT JOIN purchases p ON p.venue_id = v.id GROUP BY v.id ORDER BY v.id',
  )).rows
  out.push(table(
    ['recinto', 'aforo', 'base', 'vendidos', 'base − vendidos', 'derivada (app)', ''],
    capacityRows.map((row) => {
      const base = overrides.get(row.id) ?? row.capacity
      const expected = base - row.sold
      const app = derived.seats.get(row.id)
      const ok = app === expected && expected >= 0
      if (!ok) failures.push(`${row.id}: base ${base} − vendidos ${row.sold} = ${expected}, la aplicación deriva ${app ?? 'nada'}`)
      return [row.id, row.capacity, base, row.sold, expected, app ?? '—', ok ? 'ok' : 'FALLA']
    }),
  ))
  if (overrides.size > 0) out.push(`Base sobrescrita por NUXT_AVAILABILITY_OVERRIDES: ${[...overrides.keys()].join(', ')}.`)

  // PostgreSQL does not allow rows that violate a validated constraint. The reader
  // has no integrity check of its own: `amcheck` is a superuser extension.
  const constraints = (await database.query<{ contype: string, total: number, validated: number }>(
    `SELECT c.contype::text AS contype, COUNT(*) AS total, COUNT(*) FILTER (WHERE c.convalidated) AS validated
     FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public' AND c.contype IN ('f', 'c')
     GROUP BY c.contype`,
  )).rows
  const counted = (contype: string) => constraints.find((row) => row.contype === contype) ?? { total: 0, validated: 0 }
  const foreignKeys = counted('f')
  const checks = counted('c')
  if (foreignKeys.total === 0 || foreignKeys.validated !== foreignKeys.total) failures.push(`claves foráneas validadas: ${foreignKeys.validated} de ${foreignKeys.total}`)
  if (checks.total === 0 || checks.validated !== checks.total) failures.push(`restricciones CHECK validadas: ${checks.validated} de ${checks.total}`)
  const orphans = (await database.query<{ tickets: number, users: number, venues: number }>(
    `SELECT
       (SELECT COUNT(*) FROM tickets t WHERE NOT EXISTS (SELECT 1 FROM purchases p WHERE p.folio = t.folio)) AS tickets,
       (SELECT COUNT(*) FROM purchases p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id)) AS users,
       (SELECT COUNT(*) FROM purchases p WHERE NOT EXISTS (SELECT 1 FROM venues v WHERE v.id = p.venue_id)) AS venues`,
  )).rows[0]!
  if (orphans.tickets + orphans.users + orphans.venues > 0) {
    failures.push(`huérfanos: ${orphans.tickets} boletos sin compra, ${orphans.users} compras sin usuario, ${orphans.venues} compras sin recinto`)
  }
  out.push(`Claves foráneas validadas: ${foreignKeys.validated} de ${foreignKeys.total}`)
  out.push(`Restricciones CHECK validadas: ${checks.validated} de ${checks.total}`)
  out.push(`Huérfanos: boletos sin compra ${orphans.tickets}, compras sin usuario ${orphans.users}, compras sin recinto ${orphans.venues}`)

  // ── No sensitive data ───────────────────────────────────────────────────
  const summaries = (await database.query<{ summary: string }>('SELECT payment_summary::text AS summary FROM purchases')).rows
  const sensitive = summaries.filter((row) => /\d{13,19}/.test(row.summary) || /cvv|security/i.test(row.summary)).length
  if (sensitive > 0) failures.push(`payment_summary: ${sensitive} filas con un número de 13 a 19 dígitos o un código de seguridad`)
  out.push(section('Sin datos sensibles del pago', 'requisitos RNF-15 y RN-CON-05'))
  out.push(`Filas de payment_summary con 13 a 19 dígitos seguidos o «cvv»/«security»: ${sensitive}`)

  // ── Views ───────────────────────────────────────────────────────────────
  // The existing ones, read from the catalog: a new view shows up without touching
  // the report.
  const views = (await database.query<{ name: string }>(
    "SELECT table_name AS name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name",
  )).rows
  out.push(section('Vistas de la base'))
  for (const view of views) {
    // The name comes from the catalog, not from input: it is quoted as an identifier.
    const quoted = `"${view.name.replaceAll('"', '""')}"`
    const counted = (await database.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quoted}`)).rows[0]!
    out.push(`  ${view.name}: ${counted.n} ${counted.n === 1 ? 'fila' : 'filas'}`)
  }

  out.push(section('Resultado'))
  out.push(failures.length === 0 ? 'Todas las comprobaciones de consistencia pasan.' : `Fallan ${failures.length} comprobaciones:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`)

  return { text: out.join('\n'), failures }
}
