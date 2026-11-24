import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { museumFee } from '../server/domain/booking'
import { evaluateFilm, evaluateFormat, findFormat } from '../server/domain/cinema'
import {
  evaluateAttendeeAge,
  evaluateCinemaSelection,
  evaluateEventDate,
  evaluateEventTime,
  evaluateMuseumSelection,
  evaluateSeatNumbers,
  evaluateTheaterSelection,
  evaluateTicketQuantity,
  type CinemaField,
  type CinemaSelectionInput,
  type MuseumField,
  type MuseumSelectionInput,
  type TheaterField,
  type TheaterSelectionInput,
} from '../server/domain/purchase'
import type { Result, ResultCode } from '../server/domain/result'
import { evaluatePlay, evaluateSection } from '../server/domain/theater'
import type { CalendarDate, CinemaVenue, FilmClassification, MuseumVenue, TheaterVenue } from '../types'

// The opening, quantity and amount oracles come from running the legacy console
// implementation. If a test fails, the defect is in the port, not in the table. Each case carries its identifier in
// its name.

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 } // Saturday
const USER_LIMIT = 10

// INV27: a transcription of the earlier `calculateAmount` and `museumFee`, in units
// with `number`, which lives only in the test. The prices in units are the data's
// prices divided by 100.
function amountInUnits(unitPrice: number, quantity: number, feePerTicket: number): number {
  if (quantity <= 0) return 0
  if (unitPrice < 0) return 0
  const fee = feePerTicket < 0 ? 0 : feePerTicket
  return (unitPrice + fee) * quantity
}

function museumFeeInUnits(museum: MuseumVenue, isResident: boolean): number {
  if (!museum.hasDifferentiatedFee) return museum.generalFee / 100
  return isResident ? museum.residentFee / 100 : museum.generalFee / 100
}

/** The earlier amount, in units, converted to cents. */
const toCents = (units: number): number => Math.round(units * 100)

function theater(id: string): TheaterVenue {
  const found = VENUES.find((v) => v.id === id)
  if (!found || found.category !== 'teatro') throw new Error(`No es un teatro: ${id}`)
  return found
}

const COLON = theater('teatro-colon')
const SCALA = theater('teatro-scala')
const METROPOLITAN = theater('teatro-metropolitan')

/** Base input B: Scala, Monday October 5, 2026 at 15:00, 10 tickets. */
const BASE: TheaterSelectionInput = {
  playIndex: 0,
  sectionIndex: 0,
  date: '05/10/2026',
  time: '15:00',
  quantity: '10',
}

interface Case {
  readonly venue?: TheaterVenue
  readonly input?: Partial<TheaterSelectionInput>
  readonly available?: number
  readonly today?: CalendarDate
}

function select({ venue = SCALA, input = {}, available, today = TODAY }: Case) {
  return evaluateTheaterSelection(venue, { ...BASE, ...input }, USER_LIMIT, available ?? venue.capacity, today)
}

type Rejection = readonly [ResultCode, TheaterField]

function expectRejection(c: Case, [code, field]: Rejection): void {
  const selection = select(c)
  expect(selection.ok).toBe(false)
  if (selection.ok) return
  expect(selection.result.code).toBe(code)
  expect(selection.field).toBe(field)
}

function expectAmount(c: Case, amount: number): void {
  const selection = select(c)
  expect(selection.ok).toBe(true)
  if (!selection.ok) return
  expect(selection.quote.amount).toBe(amount)
}

describe('evaluateTheaterSelection — obra y sección', () => {
  it('P1 B → OK, 250000, Nabucco, Platea', () => {
    const selection = select({})
    expect(selection.ok).toBe(true)
    if (!selection.ok) return
    expect(selection.quote.amount).toBe(250000)
    expect(selection.quote.play).toBe('Nabucco (Verdi)')
    expect(selection.quote.section.name).toBe('Platea')
    expect(selection.quote.quantity).toBe(10)
    expect(selection.quote.date).toEqual({ year: 2026, month: 10, day: 5 })
    expect(selection.quote.time).toEqual({ hour: 15, minute: 0 })
  })

  it.each([
    ['P2', { input: { playIndex: 3 } }, ['ERR_PLAY_INVALID', 'play']],
    ['P3', { input: { playIndex: -1 } }, ['ERR_PLAY_INVALID', 'play']],
    ['P4', { input: { playIndex: 1.5 } }, ['ERR_INPUT_INVALID', 'play']],
    ['P5', { input: { sectionIndex: 7 } }, ['ERR_SECTION_INVALID', 'section']],
    ['P7', { venue: METROPOLITAN, input: { sectionIndex: 5, time: '10:00' } }, ['ERR_SECTION_INVALID', 'section']],
    ['P9', { input: { playIndex: 3, sectionIndex: 7 } }, ['ERR_PLAY_INVALID', 'play']],
  ] satisfies [string, Case, Rejection][])('%s', (_id, c, expected) => {
    expectRejection(c, expected)
  })

  it('P6 Galleria II → 35000', () => expectAmount({ input: { sectionIndex: 6 } }, 35000))
  it('P8 Metropólitan, Anfiteatro → 500000', () =>
    expectAmount({ venue: METROPOLITAN, input: { sectionIndex: 4, time: '10:00' } }, 500000))
})

describe('evaluateTheaterSelection — fecha y hora', () => {
  it.each([
    ['P10', { input: { date: '5-10-2026' } }, ['ERR_DATE_FORMAT', 'date']],
    ['P11', { input: { date: '31/02/2027' } }, ['ERR_DATE_INVALID', 'date']],
    ['P12 fail-fast: la hora no se evalúa', { input: { date: '02/10/2026', time: 'abc' } }, ['ERR_DATE_PAST', 'date']],
    ['P13 la hora se lee antes del cierre', { input: { date: '04/10/2026', time: 'abc' } }, ['ERR_TIME_FORMAT', 'time']],
    ['P14', { input: { date: '04/10/2026' } }, ['ERR_DAY_CLOSED', 'date']],
    ['P15', { input: { date: '25/12/2026' } }, ['ERR_DAY_HOLIDAY', 'date']],
    ['P17', { input: { time: '18:01' } }, ['ERR_OUTSIDE_HOURS', 'time']],
    ['P18', { input: { time: '12:59' } }, ['ERR_OUTSIDE_HOURS', 'time']],
    ['P19', { input: { time: '24:00' } }, ['ERR_TIME_OUT_OF_RANGE', 'time']],
  ] satisfies [string, Case, Rejection][])('%s', (_id, c, expected) => {
    expectRejection(c, expected)
  })

  it('P16 el cierre está incluido', () => expectAmount({ input: { time: '18:00' } }, 250000))
  it('P20 el mismo día se acepta', () => expectAmount({ input: { date: '03/10/2026' } }, 250000))
})

describe('evaluateTheaterSelection — cantidad', () => {
  it.each([
    ['P21 la apertura va antes que la cantidad', { input: { date: '04/10/2026', quantity: '0' } }, ['ERR_DAY_CLOSED', 'date']],
    ['P22', { input: { quantity: '11' } }, ['ERR_EXCEEDS_USER_LIMIT', 'quantity']],
    ['P23', { input: { quantity: '0' } }, ['ERR_QUANTITY_NOT_POSITIVE', 'quantity']],
    ['P24', { input: { quantity: '-3' } }, ['ERR_QUANTITY_NOT_POSITIVE', 'quantity']],
    ['P25', { input: { quantity: '2.5' } }, ['ERR_INTEGER_EXPECTED', 'quantity']],
    ['P26', { input: { quantity: '' } }, ['ERR_INTEGER_EXPECTED', 'quantity']],
    ['P29', { input: { quantity: '5' }, available: 3 }, ['ERR_EXCEEDS_AVAILABILITY', 'quantity']],
    ['P30 orden de RN-CAN-06', { input: { quantity: '11' }, available: 5 }, ['ERR_EXCEEDS_USER_LIMIT', 'quantity']],
  ] satisfies [string, Case, Rejection][])('%s', (_id, c, expected) => {
    expectRejection(c, expected)
  })

  it('P27 espacios en la cantidad', () => expectAmount({ input: { quantity: ' 10 ' } }, 250000))
  it('P28 signo explícito → 75000', () => expectAmount({ input: { quantity: '+3' } }, 75000))
})

describe('evaluateTheaterSelection — otros recintos y today', () => {
  it('P31 Colón, 3 × Paraíso → 2400000', () =>
    expectAmount({ venue: COLON, input: { sectionIndex: 6, time: '20:00', quantity: '3' } }, 2400000))

  it.each([
    ['P32 Colón, Revolución de Mayo', { venue: COLON, input: { date: '25/05/2027' } }, ['ERR_DAY_HOLIDAY', 'date']],
    ['P34 Metropólitan, 09:59', { venue: METROPOLITAN, input: { date: '04/10/2026', time: '09:59' } }, ['ERR_OUTSIDE_HOURS', 'time']],
    ['P35 today inexistente', { today: { year: 2026, month: 2, day: 30 } }, ['ERR_DATE_INVALID', 'date']],
  ] satisfies [string, Case, Rejection][])('%s', (_id, c, expected) => {
    expectRejection(c, expected)
  })

  it('P33 Metropólitan abre en domingo, 10 × Preferente A → 1800000', () =>
    expectAmount({ venue: METROPOLITAN, input: { date: '04/10/2026', time: '10:00' } }, 1800000))
})

describe('validación por campo', () => {
  it('evaluateEventDate evalúa el día: domingo en la Scala → ERR_DAY_CLOSED', () => {
    const date = evaluateEventDate(SCALA, '04/10/2026', TODAY)
    expect(date.ok ? 'OK' : date.result.code).toBe('ERR_DAY_CLOSED')
  })

  it('evaluateEventTime sin fecha solo evalúa el formato', () => {
    expect(evaluateEventTime(SCALA, null, '18:01').ok).toBe(true)
  })

  it('evaluateEventTime con fecha evalúa el horario', () => {
    const time = evaluateEventTime(SCALA, { year: 2026, month: 10, day: 5 }, '18:01')
    expect(time.ok ? 'OK' : time.result.code).toBe('ERR_OUTSIDE_HOURS')
  })

  it.each([
    ['P22', '11', SCALA.capacity, 'ERR_EXCEEDS_USER_LIMIT'],
    ['P23', '0', SCALA.capacity, 'ERR_QUANTITY_NOT_POSITIVE'],
    ['P24', '-3', SCALA.capacity, 'ERR_QUANTITY_NOT_POSITIVE'],
    ['P25', '2.5', SCALA.capacity, 'ERR_INTEGER_EXPECTED'],
    ['P26', '', SCALA.capacity, 'ERR_INTEGER_EXPECTED'],
    ['P27', ' 10 ', SCALA.capacity, 10],
    ['P28', '+3', SCALA.capacity, 3],
    ['P29', '5', 3, 'ERR_EXCEEDS_AVAILABILITY'],
    ['P30', '11', 5, 'ERR_EXCEEDS_USER_LIMIT'],
  ])('evaluateTicketQuantity %s %j', (_id, text, available, expected) => {
    const quantity = evaluateTicketQuantity(text, USER_LIMIT, available)
    expect(quantity.ok ? quantity.value : quantity.result.code).toBe(expected)
  })
})

describe('invariantes: campos frente a compuesta', () => {
  const dates = ['', '5-10-2026', '31/02/2027', '02/10/2026', '03/10/2026', '04/10/2026', '05/10/2026', '25/12/2026']
  const times = ['', 'abc', '24:00', '09:59', '12:59', '15:00', '18:00', '18:01']
  const quantities = ['', '2.5', '0', '1', '10', '11']

  const universe: { venue: TheaterVenue; input: TheaterSelectionInput }[] = []
  for (const venue of [COLON, SCALA, METROPOLITAN])
    for (const playIndex of [0, 3])
      for (const sectionIndex of [0, 7])
        for (const date of dates)
          for (const time of times)
            for (const quantity of quantities)
              universe.push({ venue, input: { playIndex, sectionIndex, date, time, quantity } })

  function fieldResults(venue: TheaterVenue, input: TheaterSelectionInput): Record<TheaterField, Result | null> {
    const d = evaluateEventDate(venue, input.date, TODAY)
    const t = evaluateEventTime(venue, d.ok ? d.value : null, input.time)
    const q = evaluateTicketQuantity(input.quantity, USER_LIMIT, venue.capacity)
    const play = evaluatePlay(venue, input.playIndex)
    const section = evaluateSection(venue, input.sectionIndex)
    return {
      play: play.ok ? null : play,
      section: section.ok ? null : section,
      date: d.ok ? null : d.result,
      time: t.ok ? null : t.result,
      quantity: q.ok ? null : q.result,
    }
  }

  it(`el universo tiene ${3 * 2 * 2 * 8 * 8 * 6} combinaciones`, () => {
    expect(universe).toHaveLength(4608)
  })

  it('INV1 la compuesta da OK si y solo si los cinco campos dan OK', () => {
    for (const { venue, input } of universe) {
      const fields = fieldResults(venue, input)
      const allOk = Object.values(fields).every((r) => r === null)
      const selection = evaluateTheaterSelection(venue, input, USER_LIMIT, venue.capacity, TODAY)
      expect(selection.ok, `${venue.id} ${JSON.stringify(input)}`).toBe(allOk)
    }
  })

  it('INV27 teatro: el monto en centavos es el anterior por 100', () => {
    let accepted = 0
    for (const { venue, input } of universe) {
      const selection = evaluateTheaterSelection(venue, input, USER_LIMIT, venue.capacity, TODAY)
      if (!selection.ok) continue
      accepted++
      const { section, quantity, amount } = selection.quote
      expect(amount, `${venue.id} ${JSON.stringify(input)}`).toBe(toCents(amountInUnits(section.price / 100, quantity, 0)))
    }
    expect(accepted).toBeGreaterThan(0)
  })

  it('INV2 si la compuesta rechaza en el campo F con el código C, el campo F rechaza con C', () => {
    for (const { venue, input } of universe) {
      const selection = evaluateTheaterSelection(venue, input, USER_LIMIT, venue.capacity, TODAY)
      if (selection.ok) continue
      const field = fieldResults(venue, input)[selection.field]
      expect(field?.code, `${venue.id} ${JSON.stringify(input)}`).toBe(selection.result.code)
    }
  })
})

// ── Cinema purchase ───────────────────────────────────────────────────────

function cinema(id: string): CinemaVenue {
  const found = VENUES.find((v) => v.id === id)
  if (!found || found.category !== 'cine') throw new Error(`No es un cine: ${id}`)
  return found
}

const CINEMARK = cinema('cinemark')
const CINEPOLIS = cinema('cinepolis')
const CINEMEX = cinema('cinemex')
const AMC = cinema('amc')

type Outcome = number | ResultCode

function outcome(checked: { ok: true; value: number } | { ok: false; result: Result }): Outcome {
  return checked.ok ? checked.value : checked.result.code
}

describe('evaluateAttendeeAge', () => {
  it.each([
    ['E1', 'C', 'abc', 'ERR_INTEGER_EXPECTED'],
    ['E2', 'C', '131', 'ERR_AGE_OUT_OF_RANGE'],
    // The range comes before evaluateAge's negative guard.
    ['E3', 'C', '-1', 'ERR_AGE_OUT_OF_RANGE'],
    ['E4', 'C', '130', 130],
    ['E5', 'AA', '0', 0],
    ['E6', null, '16', 16],
    ['E7', 'C', ' +18 ', 18],
  ] as const)('%s — %s con %j → %s', (_, classification, text, expected) => {
    expect(outcome(evaluateAttendeeAge(classification as FilmClassification | null, text))).toBe(expected)
  })
})

describe('evaluateSeatNumbers — sala de 60 butacas', () => {
  it.each([
    ['U1', ['61', '12', '12'], ['ERR_SEAT_INVALID', 12, 'ERR_SEAT_REPEATED']],
    ['U2', ['12', '12', '12'], [12, 'ERR_SEAT_REPEATED', 'ERR_SEAT_REPEATED']],
    // A rejected seat is not recorded and does not count for repetition.
    ['U3', ['61', '61'], ['ERR_SEAT_INVALID', 'ERR_SEAT_INVALID']],
    ['U4', ['abc', '12', '+12'], ['ERR_INTEGER_EXPECTED', 12, 'ERR_SEAT_REPEATED']],
  ] as const)('%s — %j', (_, texts, expected) => {
    expect(evaluateSeatNumbers(texts, 60).map(outcome)).toEqual(expected)
  })
})

/** Base K: Cinépolis, Insidious (C), 21 years old, VIP, Saturday 10/10/2026 at 19:00, 2 tickets. */
const CINEMA_BASE: CinemaSelectionInput = {
  filmIndex: 3,
  age: '21',
  formatId: 'vip',
  date: '10/10/2026',
  time: '19:00',
  quantity: '2',
  seats: ['12', '13'],
}

/** Cinemark, Spider-Man (PG-13), Tradicional, Christmas at 23:59, 1 ticket. */
const CINEMARK_BASE: CinemaSelectionInput = {
  filmIndex: 0,
  age: '21',
  formatId: 'tradicional',
  date: '25/12/2026',
  time: '23:59',
  quantity: '1',
  seats: ['1'],
}

interface CinemaCase {
  readonly venue?: CinemaVenue
  readonly base?: CinemaSelectionInput
  readonly input?: Partial<CinemaSelectionInput>
}

function selectCinema({ venue = CINEPOLIS, base = CINEMA_BASE, input = {} }: CinemaCase) {
  return evaluateCinemaSelection(venue, { ...base, ...input }, USER_LIMIT, venue.capacity, TODAY)
}

type CinemaRejection = readonly [ResultCode, CinemaField, (number | null)?]

describe('evaluateCinemaSelection — rechazos', () => {
  const K21 = { filmIndex: 0, age: '12', formatId: 'platino', quantity: '1', seats: ['60'] }

  it.each([
    ['K2 edad insuficiente', { input: { age: '16' } }, ['ERR_AGE_INSUFFICIENT', 'age']],
    ['K4 edad antes que formato', { input: { age: '16', formatId: 'vr' } }, ['ERR_AGE_INSUFFICIENT', 'age']],
    ['K5 rango de edad', { input: { age: '131' } }, ['ERR_AGE_OUT_OF_RANGE', 'age']],
    ['K6 formato no operado', { venue: CINEMARK, input: { filmIndex: 0, formatId: 'vr' } }, ['ERR_FORMAT_UNAVAILABLE', 'format']],
    ['K7 formato antes que fecha', { input: { formatId: 'vr', date: '02/10/2026' } }, ['ERR_FORMAT_UNAVAILABLE', 'format']],
    ['K8 película antes que edad', { input: { filmIndex: 9, age: 'abc' } }, ['ERR_FILM_INVALID', 'film']],
    ['K9 fail-fast en cine', { input: { date: '02/10/2026', time: 'abc' } }, ['ERR_DATE_PAST', 'date']],
    ['K12 cierre incluido', { input: { time: '23:31' } }, ['ERR_OUTSIDE_HOURS', 'time']],
    ['K14 cantidad antes que asientos', { input: { quantity: '11', seats: ['61'] } }, ['ERR_EXCEEDS_USER_LIMIT', 'quantity']],
    ['K15 primer asiento rechazado', { input: { quantity: '3', seats: ['61', '12', '12'] } }, ['ERR_SEAT_INVALID', 'seats', 0]],
    ['K16 repetido en el posterior', { input: { quantity: '3', seats: ['11', '12', '12'] } }, ['ERR_SEAT_REPEATED', 'seats', 2]],
    ['K18 rango según el formato', { input: { formatId: 'vip', seats: ['240', '1'] } }, ['ERR_SEAT_INVALID', 'seats', 0]],
    ['K19 cuerpo manipulado', { input: { quantity: '2', seats: ['12'] } }, ['ERR_INPUT_INVALID', 'seats', null]],
    ['K23 PG-13 restringe en el C', { venue: CINEMARK, base: CINEMARK_BASE, input: { age: '12' } }, ['ERR_AGE_INSUFFICIENT', 'age']],
  ] as const)('%s', (_, c: CinemaCase, [code, field, seatIndex]: CinemaRejection) => {
    const selection = selectCinema(c)
    expect(selection.ok).toBe(false)
    if (selection.ok) return
    expect(selection.result.code).toBe(code)
    expect(selection.field).toBe(field)
    expect(selection.seatIndex).toBe(seatIndex ?? null)
  })

  it('K22 B no restringe', () => {
    expect(selectCinema({ venue: CINEMEX, input: { ...K21, age: '5' } }).ok).toBe(true)
  })
})

describe('evaluateCinemaSelection — aceptación y montos', () => {
  it.each([
    ['K1 base', {}, { subtotal: 56000, feeTotal: 1200, amount: 57200 }],
    ['K3 frontera de edad', { input: { age: '18' } }, { amount: 57200 }],
    // Cinemas do not close on holidays (RN-APE-03): September 16 in Mexico.
    ['K10 festivo en cine', { input: { date: '16/09/2027', time: '12:00' } }, { amount: 57200 }],
    ['K11 cierre incluido', { input: { time: '23:30' } }, { amount: 57200 }],
    ['K13 23:59 en EE.UU.', { venue: CINEMARK, base: CINEMARK_BASE }, { amount: 1550 }],
    ['K17 rango según el formato', { input: { formatId: 'tradicional', seats: ['240', '1'] } }, { amount: 20200 }],
    [
      'K20 monto AMC',
      { venue: AMC, input: { filmIndex: 1, age: '5', formatId: 'imax', seats: ['1', '2'] } },
      { amount: 4900, subtotal: 4600, feeTotal: 300 },
    ],
    [
      'K21 monto Cinemex',
      { venue: CINEMEX, input: { filmIndex: 0, age: '12', formatId: 'platino', quantity: '1', seats: ['60'] } },
      { amount: 29500 },
    ],
  ] as const)('%s', (_, c: CinemaCase, expected) => {
    const selection = selectCinema(c)
    expect(selection.ok).toBe(true)
    if (!selection.ok) return
    expect(selection.quote).toMatchObject(expected)
  })
})

describe('invariantes: campos frente a compuesta en cine', () => {
  const universe: CinemaSelectionInput[] = []
  for (const filmIndex of [3, 9])
    for (const age of ['21', '16', 'abc', '131'])
      for (const formatId of ['vip', 'vr', 'foo'])
        for (const date of ['10/10/2026', '02/10/2026', '31/02/2027'])
          for (const time of ['19:00', '23:45', 'abc'])
            for (const quantity of ['2', '11', '0'])
              for (const seats of [['12', '13'], ['61', '13'], ['12', '12']])
                universe.push({ filmIndex, age, formatId, date, time, quantity, seats })

  interface CinemaFields {
    readonly scalar: Record<Exclude<CinemaField, 'seats'>, Result | null>
    /** Null without a valid format: without a room there is no range to compare against. */
    readonly seats: readonly (Result | null)[] | null
  }

  function cinemaFields(input: CinemaSelectionInput): CinemaFields {
    const venue = CINEPOLIS
    const film = evaluateFilm(venue, input.filmIndex)
    const classification = film.ok ? venue.films[input.filmIndex]!.classification : null
    const age = evaluateAttendeeAge(classification, input.age)
    const format = evaluateFormat(venue, input.formatId)
    const d = evaluateEventDate(venue, input.date, TODAY)
    const t = evaluateEventTime(venue, d.ok ? d.value : null, input.time)
    const q = evaluateTicketQuantity(input.quantity, USER_LIMIT, venue.capacity)
    const room = format.ok ? findFormat(venue, input.formatId)!.seats : null
    return {
      scalar: {
        film: film.ok ? null : film,
        age: age.ok ? null : age.result,
        format: format.ok ? null : format,
        date: d.ok ? null : d.result,
        time: t.ok ? null : t.result,
        quantity: q.ok ? null : q.result,
      },
      seats: room === null ? null : evaluateSeatNumbers(input.seats, room).map((r) => (r.ok ? null : r.result)),
    }
  }

  const compound = (input: CinemaSelectionInput) =>
    evaluateCinemaSelection(CINEPOLIS, input, USER_LIMIT, CINEPOLIS.capacity, TODAY)

  it(`el universo tiene ${2 * 4 * 3 * 3 * 3 * 3 * 3} combinaciones`, () => {
    expect(universe).toHaveLength(1944)
  })

  it('INV3 la compuesta da OK si y solo si todos los campos y todos los asientos dan OK', () => {
    for (const input of universe) {
      const fields = cinemaFields(input)
      const allOk = Object.values(fields.scalar).every((r) => r === null)
        && fields.seats !== null && fields.seats.every((r) => r === null)
      expect(compound(input).ok, JSON.stringify(input)).toBe(allOk)
    }
  })

  it('INV4 si la compuesta rechaza en el campo F con el código C, el campo F rechaza con C', () => {
    for (const input of universe) {
      const selection = compound(input)
      if (selection.ok) continue
      const fields = cinemaFields(input)
      const field = selection.field === 'seats'
        ? fields.seats?.[selection.seatIndex ?? -1]
        : fields.scalar[selection.field]
      expect(field?.code, JSON.stringify(input)).toBe(selection.result.code)
    }
  })

  it('INV27 cine: subtotal, feeTotal y amount en centavos son los anteriores por 100', () => {
    let accepted = 0
    for (const input of universe) {
      const selection = compound(input)
      if (!selection.ok) continue
      accepted++
      const { format, quantity, subtotal, feeTotal, amount } = selection.quote
      const price = format.price / 100
      const fee = CINEPOLIS.serviceFee / 100
      expect(subtotal, JSON.stringify(input)).toBe(toCents(amountInUnits(price, quantity, 0)))
      expect(feeTotal, JSON.stringify(input)).toBe(toCents(amountInUnits(0, quantity, fee)))
      expect(amount, JSON.stringify(input)).toBe(toCents(amountInUnits(price, quantity, fee)))
    }
    expect(accepted).toBeGreaterThan(0)
  })

  it('INV5 con OK, amount es subtotal más feeTotal', () => {
    for (const input of universe) {
      const selection = compound(input)
      if (selection.ok) expect(selection.quote.amount).toBe(selection.quote.subtotal + selection.quote.feeTotal)
    }
  })
})

// ── Museum ────────────────────────────────────────────────────────────────

function museum(id: string): MuseumVenue {
  const found = VENUES.find((v) => v.id === id)
  if (!found || found.category !== 'museo') throw new Error(`No es un museo: ${id}`)
  return found
}

const LOUVRE = museum('louvre')
const MET = museum('met')
const VATICANOS = museum('vaticanos')
const MNA = museum('mna')
const MNAC = museum('mnac')
const MUSEUM_LIMIT = 5

/** Base input M: Louvre, resident, Thursday October 15, 2026 at 10:00, 3 tickets. */
const MUSEUM_BASE: MuseumSelectionInput = {
  isResident: true,
  date: '15/10/2026',
  time: '10:00',
  quantity: '3',
}

function selectMuseum(venue: MuseumVenue, input: Partial<MuseumSelectionInput> = {}) {
  return evaluateMuseumSelection(venue, { ...MUSEUM_BASE, ...input }, MUSEUM_LIMIT, venue.capacity, TODAY)
}

function expectMuseumRejection(
  venue: MuseumVenue,
  input: Partial<MuseumSelectionInput>,
  code: ResultCode,
  field: MuseumField,
): void {
  const selection = selectMuseum(venue, input)
  expect(selection.ok).toBe(false)
  if (selection.ok) return
  expect(selection.result.code).toBe(code)
  expect(selection.field).toBe(field)
}

function expectMuseumQuote(
  venue: MuseumVenue,
  input: Partial<MuseumSelectionInput>,
  expected: { fee?: number; feeKind?: 'general' | 'resident'; amount?: number } = {},
): void {
  const selection = selectMuseum(venue, input)
  expect(selection.ok).toBe(true)
  if (!selection.ok) return
  if (expected.fee !== undefined) expect(selection.quote.fee).toBe(expected.fee)
  if (expected.feeKind !== undefined) expect(selection.quote.feeKind).toBe(expected.feeKind)
  if (expected.amount !== undefined) expect(selection.quote.amount).toBe(expected.amount)
}

const ONE_TICKET = { quantity: '1' }

describe('evaluateMuseumSelection — Louvre', () => {
  it('MU1 base: residente, tarifa 22 por 3', () => {
    expectMuseumQuote(LOUVRE, {}, { fee: 2200, feeKind: 'resident', amount: 6600 })
  })

  it('MU2 sin residencia se cobra la general', () => {
    expectMuseumQuote(LOUVRE, { isResident: false }, { fee: 3200, feeKind: 'general', amount: 9600 })
  })

  it('MU3 cierre semanal en martes', () => {
    expectMuseumRejection(LOUVRE, { date: '13/10/2026' }, 'ERR_DAY_CLOSED', 'date')
  })

  it('MU4 el 14 de julio no es cierre anual (A17)', () => {
    expectMuseumQuote(LOUVRE, { date: '14/07/2027', time: '12:00' })
  })

  it('MU5 el cierre anual cierra', () => {
    expectMuseumRejection(LOUVRE, { date: '25/12/2026' }, 'ERR_DAY_HOLIDAY', 'date')
  })

  it('MU6 horario nocturno del miércoles, cierre incluido', () => {
    expectMuseumQuote(LOUVRE, { date: '14/10/2026', time: '21:45' })
  })

  it('MU7 un minuto después del cierre nocturno', () => {
    expectMuseumRejection(LOUVRE, { date: '14/10/2026', time: '21:46' }, 'ERR_OUTSIDE_HOURS', 'time')
  })

  it('MU8 el jueves rige el horario base', () => {
    expectMuseumRejection(LOUVRE, { time: '18:01' }, 'ERR_OUTSIDE_HOURS', 'time')
  })

  it('MU9 el límite de museo es 5', () => {
    expectMuseumRejection(LOUVRE, { quantity: '6' }, 'ERR_EXCEEDS_USER_LIMIT', 'quantity')
  })

  it('MU10 cinco boletos sí', () => {
    expectMuseumQuote(LOUVRE, { quantity: '5' }, { amount: 11000 })
  })

  it('MU11 fail-fast: la fecha pasada corta antes de leer la hora', () => {
    expectMuseumRejection(LOUVRE, { date: '02/10/2026', time: 'abc' }, 'ERR_DATE_PAST', 'date')
  })

  it('MU12 la apertura va antes que la cantidad', () => {
    expectMuseumRejection(LOUVRE, { date: '13/10/2026', quantity: '0' }, 'ERR_DAY_CLOSED', 'date')
  })

  it('MU13 una residencia que no es booleana solo llega en un cuerpo manipulado', () => {
    expectMuseumRejection(LOUVRE, { isResident: 'si' as unknown as boolean }, 'ERR_INPUT_INVALID', 'residency')
  })
})

describe('evaluateMuseumSelection — reglas de apertura de los demás museos', () => {
  it('MU14 Vaticanos abre el último domingo del mes (A6)', () => {
    expectMuseumQuote(VATICANOS, { date: '25/10/2026', ...ONE_TICKET }, { amount: 2000 })
  })

  it('MU15 Vaticanos cierra un domingo que no es el último (A7)', () => {
    expectMuseumRejection(VATICANOS, { date: '18/10/2026', ...ONE_TICKET }, 'ERR_DAY_CLOSED', 'date')
  })

  it('MU16 el último domingo rige el horario de domingo', () => {
    expectMuseumRejection(VATICANOS, { date: '25/10/2026', time: '14:01', ...ONE_TICKET }, 'ERR_OUTSIDE_HOURS', 'time')
  })

  it('MU17 MNAC abre el lunes festivo (A11)', () => {
    expectMuseumQuote(MNAC, { date: '11/09/2028', time: '12:00', ...ONE_TICKET }, { amount: 1200 })
  })

  it('MU18 el lunes festivo rige el horario de festivo', () => {
    expectMuseumRejection(MNAC, { date: '11/09/2028', time: '15:01', ...ONE_TICKET }, 'ERR_OUTSIDE_HOURS', 'time')
  })

  it('MU19 el cierre anual domina sobre el lunes festivo (A13)', () => {
    expectMuseumRejection(MNAC, { date: '01/01/2029', time: '12:00', ...ONE_TICKET }, 'ERR_DAY_HOLIDAY', 'date')
  })

  it('MU20 MNAC cierra el lunes sin festivo', () => {
    expectMuseumRejection(MNAC, { date: '12/10/2026', time: '12:00', ...ONE_TICKET }, 'ERR_DAY_CLOSED', 'date')
  })

  it('MU21 temporada de verano del MNAC', () => {
    expectMuseumQuote(MNAC, { date: '15/05/2027', time: '19:30', ...ONE_TICKET })
  })

  it('MU22 un domingo de verano manda el horario de domingo', () => {
    expectMuseumRejection(MNAC, { date: '16/05/2027', time: '15:01', ...ONE_TICKET }, 'ERR_OUTSIDE_HOURS', 'time')
  })

  it('MU23 los museos no cierran por festivo (RN-APE-10)', () => {
    expectMuseumQuote(MNA, { date: '16/09/2027', time: '12:00', quantity: '5' }, { fee: 10500, amount: 52500 })
  })

  it('MU24 MNA cierra los lunes', () => {
    expectMuseumRejection(MNA, { date: '12/10/2026', time: '12:00', ...ONE_TICKET }, 'ERR_DAY_CLOSED', 'date')
  })

  it('MU25 Met cierra los miércoles', () => {
    expectMuseumRejection(MET, { date: '14/10/2026', time: '12:00', ...ONE_TICKET }, 'ERR_DAY_CLOSED', 'date')
  })

  it('MU26 horario de fin de semana del Met en viernes', () => {
    expectMuseumQuote(MET, { date: '16/10/2026', time: '20:59', ...ONE_TICKET })
  })

  it('MU27 sin tarifa diferenciada la residencia no cambia la tarifa', () => {
    expectMuseumQuote(MET, { time: '11:00', ...ONE_TICKET }, { fee: 3000, feeKind: 'general', amount: 3000 })
  })
})

describe('invariantes: campos frente a compuesta en museo', () => {
  const universe: MuseumSelectionInput[] = []
  for (const isResident of [true, false])
    for (const date of ['15/10/2026', '13/10/2026', '02/10/2026', '31/02/2027'])
      for (const time of ['10:00', '18:01', 'abc'])
        for (const quantity of ['3', '6', '0'])
          universe.push({ isResident, date, time, quantity })

  function museumFields(input: MuseumSelectionInput): Record<Exclude<MuseumField, 'residency'>, Result | null> {
    const d = evaluateEventDate(LOUVRE, input.date, TODAY)
    const t = evaluateEventTime(LOUVRE, d.ok ? d.value : null, input.time)
    const q = evaluateTicketQuantity(input.quantity, MUSEUM_LIMIT, LOUVRE.capacity)
    return {
      date: d.ok ? null : d.result,
      time: t.ok ? null : t.result,
      quantity: q.ok ? null : q.result,
    }
  }

  const compound = (input: MuseumSelectionInput) =>
    evaluateMuseumSelection(LOUVRE, input, MUSEUM_LIMIT, LOUVRE.capacity, TODAY)

  it(`el universo tiene ${2 * 4 * 3 * 3} combinaciones`, () => {
    expect(universe).toHaveLength(72)
  })

  it('INV6 la compuesta da OK si y solo si fecha, hora y cantidad dan OK', () => {
    for (const input of universe) {
      const allOk = Object.values(museumFields(input)).every((r) => r === null)
      expect(compound(input).ok, JSON.stringify(input)).toBe(allOk)
    }
  })

  it('INV7 si la compuesta rechaza en el campo F con el código C, el campo F rechaza con C', () => {
    for (const input of universe) {
      const selection = compound(input)
      if (selection.ok) continue
      // Residency never rejects in this universe: every value is a boolean.
      expect(selection.field).not.toBe('residency')
      if (selection.field === 'residency') continue
      expect(museumFields(input)[selection.field]?.code, JSON.stringify(input)).toBe(selection.result.code)
    }
  })

  it('INV27 museo: tarifa y monto en centavos son los anteriores por 100', () => {
    let accepted = 0
    for (const input of universe) {
      const selection = compound(input)
      if (!selection.ok) continue
      accepted++
      const fee = museumFeeInUnits(LOUVRE, input.isResident)
      expect(selection.quote.fee, JSON.stringify(input)).toBe(toCents(fee))
      expect(selection.quote.amount, JSON.stringify(input)).toBe(toCents(amountInUnits(fee, selection.quote.quantity, 0)))
    }
    expect(accepted).toBeGreaterThan(0)
  })

  it('INV8 con OK, amount es fee por cantidad y fee es la tarifa de museumFee', () => {
    for (const input of universe) {
      const selection = compound(input)
      if (!selection.ok) continue
      expect(selection.quote.amount).toBe(selection.quote.fee * selection.quote.quantity)
      expect(selection.quote.fee).toBe(museumFee(LOUVRE, input.isResident))
    }
  })
})
