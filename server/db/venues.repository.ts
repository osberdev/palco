import type { Database, Queryable } from './client.ts'
import { parseVenueRows, type AnnualClosureRow, type CinemaRow, type ClosedWeekdayRow, type ExceptionRow, type FilmRow, type FormatRow, type MuseumRow, type ParsedVenues, type PlayRow, type SectionRow, type TheaterRow, type VenueBaseRow, type VenueHoursRow, type VenueRows } from './venue-rows.ts'
import type { TimeOfDay, Venue } from '../../types'

/** A `venue_prices` row, in cents. */
export interface VenuePriceRow {
  readonly kind: 'section' | 'format' | 'general' | 'resident' | 'service_fee'
  readonly label: string
  readonly priceCents: number
}

function clock(time: TimeOfDay): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
}

/**
 * The prices the catalog declares for a venue. Without a differentiated fee there
 * is no resident row: the catalog repeats the general fee by convention, and no
 * purchase charges that fee.
 */
export function venuePrices(venue: Venue): readonly VenuePriceRow[] {
  switch (venue.category) {
    case 'teatro':
      return venue.sections.map((section) => ({ kind: 'section', label: section.name, priceCents: section.price }))
    case 'cine':
      return [
        ...venue.formats.map((format): VenuePriceRow => ({ kind: 'format', label: format.id, priceCents: format.price })),
        { kind: 'service_fee', label: 'service_fee', priceCents: venue.serviceFee },
      ]
    case 'museo':
      return venue.hasDifferentiatedFee
        ? [
            { kind: 'general', label: 'general', priceCents: venue.generalFee },
            { kind: 'resident', label: 'resident', priceCents: venue.residentFee },
          ]
        : [{ kind: 'general', label: 'general', priceCents: venue.generalFee }]
  }
}

/** A venue's child tables, the ones `syncVenues` deletes and writes again. */
const CHILD_TABLES = [
  'venue_hours', 'venue_closed_weekdays', 'venue_exceptions', 'venue_annual_closures',
  'venue_theaters', 'venue_sections', 'venue_plays', 'venue_cinemas', 'venue_formats', 'venue_films', 'venue_museums',
] as const

/**
 * Writes the complete venues to the database: `server/data/catalog.ts` is the
 * seed, run only by `palco_admin` from `db:init` and `db:seed`.
 *
 * In a single transaction and in this order: delete the venues' child rows, upsert
 * the venues and insert the children again, so a withdrawn section disappears and
 * applying it twice changes nothing. The upsert is `ON CONFLICT DO UPDATE` rather
 * than a delete, which would collide with the purchases that reference the venue.
 * Positions are cleared first so that reordering the catalog does not collide with
 * their unique index. A venue that left the catalog is only deleted if it has no
 * purchases.
 */
export async function syncVenues(database: Database, venues: readonly Venue[]): Promise<void> {
  // One statement per table for all venues, with `unnest`: about 250 rows, and one
  // query per row made every test database slow.
  const ids = venues.map((venue) => venue.id)
  const theaters = venues.flatMap((venue) => (venue.category === 'teatro' ? [venue] : []))
  const cinemas = venues.flatMap((venue) => (venue.category === 'cine' ? [venue] : []))
  const museums = venues.flatMap((venue) => (venue.category === 'museo' ? [venue] : []))
  const each = <T, R>(list: readonly T[], pick: (item: T) => readonly R[]): R[] => list.flatMap(pick)
  const column = <T, V>(rows: readonly T[], pick: (row: T) => V): V[] => rows.map(pick)

  await database.withTransaction(async (tx) => {
    // 1. Each catalog venue's children, and the positions, which are written again
    // without colliding with their unique index.
    for (const table of CHILD_TABLES) await tx.query(`DELETE FROM ${table} WHERE venue_id = ANY($1::text[])`, [ids])
    await tx.query('UPDATE venues SET position = NULL')

    // 2. The venue.
    await tx.query(
      `INSERT INTO venues (id, position, category, name, city, jurisdiction, currency, capacity, opens, closes, restrictions)
       SELECT * FROM unnest($1::text[], $2::smallint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::time[], $10::time[], $11::text[])
       ON CONFLICT (id) DO UPDATE SET
         position     = excluded.position,
         category     = excluded.category,
         name         = excluded.name,
         city         = excluded.city,
         jurisdiction = excluded.jurisdiction,
         currency     = excluded.currency,
         capacity     = excluded.capacity,
         opens        = excluded.opens,
         closes       = excluded.closes,
         restrictions = excluded.restrictions`,
      [ids, venues.map((_, position) => position), column(venues, (v) => v.category), column(venues, (v) => v.name), column(venues, (v) => v.city),
        column(venues, (v) => v.jurisdiction), column(venues, (v) => v.currency), column(venues, (v) => v.capacity),
        column(venues, (v) => clock(v.hours.open)), column(venues, (v) => clock(v.hours.close)), column(venues, (v) => v.restrictions)],
    )

    // 3. The children.
    const hours = each(venues, (v) => [
      { id: v.id, kind: 'alternate', span: v.alternateHours },
      { id: v.id, kind: 'sunday_holiday', span: v.sundayHours },
    ])
    await tx.query('INSERT INTO venue_hours (venue_id, kind, opens, closes) SELECT * FROM unnest($1::text[], $2::text[], $3::time[], $4::time[])',
      [column(hours, (h) => h.id), column(hours, (h) => h.kind), column(hours, (h) => clock(h.span.open)), column(hours, (h) => clock(h.span.close))])
    const weekdays = each(venues, (v) => v.closedWeekdays.map((weekday) => ({ id: v.id, weekday })))
    await tx.query('INSERT INTO venue_closed_weekdays (venue_id, weekday) SELECT * FROM unnest($1::text[], $2::smallint[])',
      [column(weekdays, (w) => w.id), column(weekdays, (w) => w.weekday)])
    const exceptions = each(venues, (v) => v.exceptions.map((policy) => ({ id: v.id, policy })))
    await tx.query('INSERT INTO venue_exceptions (venue_id, policy) SELECT * FROM unnest($1::text[], $2::text[])',
      [column(exceptions, (e) => e.id), column(exceptions, (e) => e.policy)])
    const closures = each(venues, (v) => v.annualClosures.map((closure) => ({ id: v.id, ...closure })))
    await tx.query('INSERT INTO venue_annual_closures (venue_id, month, day, name) SELECT * FROM unnest($1::text[], $2::smallint[], $3::smallint[], $4::text[])',
      [column(closures, (c) => c.id), column(closures, (c) => c.month), column(closures, (c) => c.day), column(closures, (c) => c.name)])

    await tx.query('INSERT INTO venue_theaters (venue_id, attire) SELECT * FROM unnest($1::text[], $2::text[])',
      [column(theaters, (t) => t.id), column(theaters, (t) => t.dressCode)])
    const sections = each(theaters, (t) => t.sections.map((section, position) => ({ id: t.id, position, ...section })))
    await tx.query('INSERT INTO venue_sections (venue_id, position, name, price_cents) SELECT * FROM unnest($1::text[], $2::smallint[], $3::text[], $4::int[])',
      [column(sections, (r) => r.id), column(sections, (r) => r.position), column(sections, (r) => r.name), column(sections, (r) => r.price)])
    const plays = each(theaters, (t) => t.plays.map((title, position) => ({ id: t.id, position, title })))
    await tx.query('INSERT INTO venue_plays (venue_id, position, title) SELECT * FROM unnest($1::text[], $2::smallint[], $3::text[])',
      [column(plays, (r) => r.id), column(plays, (r) => r.position), column(plays, (r) => r.title)])

    await tx.query('INSERT INTO venue_cinemas (venue_id, service_fee_cents) SELECT * FROM unnest($1::text[], $2::int[])',
      [column(cinemas, (c) => c.id), column(cinemas, (c) => c.serviceFee)])
    const formats = each(cinemas, (c) => c.formats.map((format, position) => ({ venueId: c.id, position, ...format })))
    await tx.query('INSERT INTO venue_formats (venue_id, position, format_id, price_cents, seats) SELECT * FROM unnest($1::text[], $2::smallint[], $3::text[], $4::int[], $5::int[])',
      [column(formats, (r) => r.venueId), column(formats, (r) => r.position), column(formats, (r) => r.id), column(formats, (r) => r.price), column(formats, (r) => r.seats)])
    const films = each(cinemas, (c) => c.films.map((film, position) => ({ id: c.id, position, ...film })))
    await tx.query('INSERT INTO venue_films (venue_id, position, title, classification, duration_minutes) SELECT * FROM unnest($1::text[], $2::smallint[], $3::text[], $4::text[], $5::smallint[])',
      [column(films, (r) => r.id), column(films, (r) => r.position), column(films, (r) => r.title), column(films, (r) => r.classification), column(films, (r) => r.durationMinutes)])

    // Without a differentiated fee, the resident fee and the question are NULL.
    await tx.query('INSERT INTO venue_museums (venue_id, general_fee_cents, resident_fee_cents, residency_question, entry_note) SELECT * FROM unnest($1::text[], $2::int[], $3::int[], $4::text[], $5::text[])',
      [column(museums, (m) => m.id), column(museums, (m) => m.generalFee), column(museums, (m) => (m.hasDifferentiatedFee ? m.residentFee : null)),
        column(museums, (m) => (m.hasDifferentiatedFee ? m.residencyQuestion : null)), column(museums, (m) => m.entryNote)])

    // A venue that left the catalog is only deleted if it has no purchases; if it
    // has some, it loses its position and the server does not read it.
    await tx.query(
      `DELETE FROM venues
       WHERE id <> ALL($1::text[])
         AND id NOT IN (SELECT venue_id FROM purchases)`,
      [ids],
    )
  })
}

/**
 * The rows of the twelve venue tables, each with an explicit order:
 * `parseVenueRows` receives them in catalog order. Text ordering uses
 * `COLLATE "C"` so PGlite and the container sort the same way. A venue without a
 * position was withdrawn from the catalog and stays in the database for its
 * purchases (`syncVenues`): it is not sold, and it is not read.
 */
export async function loadVenueRows(database: Queryable): Promise<VenueRows> {
  const rows = async <R>(sql: string): Promise<R[]> => (await database.query<R>(sql)).rows
  return {
    venues: await rows<VenueBaseRow>('SELECT id, position, category, name, city, jurisdiction, currency, capacity, opens, closes, restrictions FROM venues WHERE position IS NOT NULL ORDER BY position, id COLLATE "C"'),
    hours: await rows<VenueHoursRow>('SELECT venue_id, kind, opens, closes FROM venue_hours WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", kind COLLATE "C"'),
    closedWeekdays: await rows<ClosedWeekdayRow>('SELECT venue_id, weekday FROM venue_closed_weekdays WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", weekday'),
    exceptions: await rows<ExceptionRow>('SELECT venue_id, policy FROM venue_exceptions WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", policy COLLATE "C"'),
    annualClosures: await rows<AnnualClosureRow>('SELECT venue_id, month, day, name FROM venue_annual_closures WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", month, day'),
    theaters: await rows<TheaterRow>('SELECT venue_id, attire FROM venue_theaters WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C"'),
    sections: await rows<SectionRow>('SELECT venue_id, position, name, price_cents FROM venue_sections WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", position'),
    plays: await rows<PlayRow>('SELECT venue_id, position, title FROM venue_plays WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", position'),
    cinemas: await rows<CinemaRow>('SELECT venue_id, service_fee_cents FROM venue_cinemas WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C"'),
    formats: await rows<FormatRow>('SELECT venue_id, position, format_id, price_cents, seats FROM venue_formats WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", position'),
    films: await rows<FilmRow>('SELECT venue_id, position, title, classification, duration_minutes FROM venue_films WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C", position'),
    museums: await rows<MuseumRow>('SELECT venue_id, general_fee_cents, resident_fee_cents, residency_question, entry_note FROM venue_museums WHERE venue_id IN (SELECT id FROM venues WHERE position IS NOT NULL) ORDER BY venue_id COLLATE "C"'),
  }
}

/** The database venues, validated and frozen, or the problems that prevent it. */
export async function loadVenues(database: Queryable): Promise<ParsedVenues> {
  return parseVenueRows(await loadVenueRows(database))
}
