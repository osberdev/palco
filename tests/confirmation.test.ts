import { describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { confirmPurchase, formatFolio, isFolio, type ConfirmationContext, type TicketsInput } from '../server/domain/confirmation'
import { evaluatePayment, type PaymentInput } from '../server/domain/payment'
import {
  evaluateTheaterSelection,
  type CinemaSelectionInput,
  type MuseumSelectionInput,
  type TheaterSelectionInput,
} from '../server/domain/purchase'
import { toCatalogVenue } from '../server/utils/catalog'
import type { CalendarDate, CinemaVenue, MuseumVenue, SavedPaymentMethod, TheaterVenue, Venue } from '../types'

// Venue texts from the legacy console implementation, with spelling restored. The
// five that DT5 checks differ from it: they contradicted its own rules. Each case
// carries its identifier in its name.

const THEATERS = VENUES.filter((v): v is TheaterVenue => v.category === 'teatro')
const MUSEUMS = VENUES.filter((v): v is MuseumVenue => v.category === 'museo')

const RESTRICTIONS: Readonly<Record<string, string>> = {
  'teatro-colon': 'Prohibido el ingreso con alimentos y bebidas. Prohibido fotografiar durante la función.',
  'teatro-scala': 'Prohibido el uso de teléfonos móviles en sala. No se permite el acceso una vez iniciada la función.',
  'teatro-metropolitan': 'Prohibido el ingreso con alimentos externos, cámaras profesionales y objetos punzocortantes.',
  'cinemark': 'Prohibidas mascotas (salvo animal de servicio certificado), armas y alimentos externos.',
  'cinepolis': 'Prohibidas mascotas (salvo animal de servicio), armas y alimentos ajenos a la dulcería.',
  'cinemex': 'Prohibidas mascotas (salvo animal de servicio), armas y alimentos ajenos a la dulcería.',
  'amc': 'Prohibidas mascotas (salvo animal de servicio certificado), armas y alimentos externos.',
  'louvre': 'Prohibidos trípodes, monopiés y palos de selfie. Fotografía sin flash permitida. Reserva de franja horaria obligatoria.',
  'met': 'Prohibidas mochilas de gran tamaño, trípodes y alimentos. El boleto incluye acceso a The Cloisters el mismo día.',
  'vaticanos': 'Código de vestimenta obligatorio: hombros y rodillas cubiertos. Prohibidas camisetas sin mangas, pantalón corto y minifalda. Control de seguridad tipo aeroportuario.',
  'mna': 'Prohibido el uso de flash, trípodes y alimentos en salas.',
  'mnac': 'Prohibidos trípodes y mochilas de gran tamaño.',
}

const DRESS_CODES: Readonly<Record<string, string>> = {
  'teatro-colon': 'Formal. Se recomienda saco y corbata en platea y palcos.',
  'teatro-scala': 'Formal. Etiqueta rigurosa en la temporada de abono.',
  'teatro-metropolitan': 'Casual. Sin código formal de vestimenta.',
}

const ENTRY_NOTES: Readonly<Record<string, string>> = {
  louvre: 'Acceso por franja horaria reservada',
  met: 'Acceso libre dentro del horario de operación',
  vaticanos: 'Acceso dentro del horario de operación',
  mna: 'Acceso dentro del horario de operación',
  mnac: 'Acceso dentro del horario de operación',
}

describe('textos de los recintos', () => {
  it('DT1: los 12 recintos tienen restricciones terminadas en punto', () => {
    expect(VENUES).toHaveLength(12)
    for (const venue of VENUES) expect(venue.restrictions, venue.id).toMatch(/\S.*\.$/)
  })

  it('DT2: los 3 teatros tienen código de vestimenta', () => {
    expect(THEATERS).toHaveLength(3)
    for (const theater of THEATERS) expect(theater.dressCode.trim(), theater.id).not.toBe('')
  })

  it('DT3: los 5 museos tienen horario de entrada sin punto final', () => {
    expect(MUSEUMS).toHaveLength(5)
    for (const museum of MUSEUMS) {
      expect(museum.entryNote.trim(), museum.id).not.toBe('')
      expect(museum.entryNote, museum.id).not.toMatch(/\.$/)
    }
  })

  it('DT4: los textos son exactamente los de la transcripción', () => {
    expect(Object.fromEntries(VENUES.map((v) => [v.id, v.restrictions]))).toEqual(RESTRICTIONS)
    expect(Object.fromEntries(THEATERS.map((v) => [v.id, v.dressCode]))).toEqual(DRESS_CODES)
    expect(Object.fromEntries(MUSEUMS.map((v) => [v.id, v.entryNote]))).toEqual(ENTRY_NOTES)
  })

  it('DT5: ningún texto de museo contradice el horario ni la tarifa', () => {
    for (const museum of MUSEUMS) {
      for (const text of [museum.restrictions, museum.entryNote]) {
        expect(text, museum.id).not.toMatch(/Último acceso|libre los domingos|gratuita/)
      }
    }
  })

  it('DT6: el catálogo no expone restricciones, vestimenta ni horario de entrada', () => {
    for (const venue of VENUES) {
      const keys = Object.keys(toCatalogVenue(venue, 0))
      for (const key of ['restrictions', 'dressCode', 'entryNote']) expect(keys, venue.id).not.toContain(key)
    }
  })
})

// ── Folio ─────────────────────────────────────────────────────────────────

describe('formatFolio', () => {
  it.each([
    ['FL1', 1, 2026, 'PLC-0001-2026'],
    ['FL2', 255, 2026, 'PLC-00FF-2026'],
    ['FL3', 65535, 2026, 'PLC-FFFF-2026'],
    ['FL4', 65536, 2026, 'PLC-10000-2026'],
    ['FL5', 1, 999, 'PLC-0001-0999'],
  ] as const)('%s: (%s, %s) → %s', (_, sequence, year, folio) => {
    expect(formatFolio(sequence, year)).toEqual({ ok: true, value: folio })
  })

  it.each([
    ['FL6', 0, 2026],
    ['FL7', -1, 2026],
    ['FL8', 1.5, 2026],
    ['FL9', Number.NaN, 2026],
    ['FL10', 1, 0],
    ['FL11', 1, 10000],
    ['FL12', 1, 2026.5],
  ] as const)('%s: (%s, %s) → ERR_INPUT_INVALID', (_, sequence, year) => {
    const folio = formatFolio(sequence, year)
    expect(folio.ok).toBe(false)
    if (!folio.ok) expect(folio.result.code).toBe('ERR_INPUT_INVALID')
  })

  it('FL13: isFolio acepta los folios de FL1–FL5', () => {
    for (const folio of ['PLC-0001-2026', 'PLC-00FF-2026', 'PLC-FFFF-2026', 'PLC-10000-2026', 'PLC-0001-0999']) {
      expect(isFolio(folio), folio).toBe(true)
    }
  })

  it.each([
    ['FL14', 'plc-0001-2026'],
    ['FL15', 'PLC-001-2026'],
    ['FL16', 'PLC-00ff-2026'],
    ['FL17', 'PLC-0001-26'],
    ['FL18', 'PLC-0001-2026 '],
    ['FL19', ''],
  ] as const)('%s: isFolio(%j) → false', (_, text) => {
    expect(isFolio(text)).toBe(false)
  })
})

// ── Purchase composite ────────────────────────────────────────────────────

const TODAY: CalendarDate = { year: 2026, month: 10, day: 3 }

function venue<T extends Venue>(id: string): T {
  const found = VENUES.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Recinto inexistente: ${id}`)
  return found as T
}

const SCALA = venue<TheaterVenue>('teatro-scala')
const CINEPOLIS = venue<CinemaVenue>('cinepolis')
const LOUVRE = venue<MuseumVenue>('louvre')
const MET = venue<MuseumVenue>('met')

/** B: Scala, play 0, Platea, Monday October 5 at 15:00, 10 tickets. */
const B: TheaterSelectionInput = { playIndex: 0, sectionIndex: 0, date: '05/10/2026', time: '15:00', quantity: '10' }
/** K: Cinépolis, Insidious (C), 21 years old, VIP, 2 tickets in seats 12 and 13. */
const K: CinemaSelectionInput = {
  filmIndex: 3,
  age: '21',
  formatId: 'vip',
  date: '10/10/2026',
  time: '19:00',
  quantity: '2',
  seats: ['12', '13'],
}
/** M: Louvre, resident, Thursday October 15 at 10:00, 3 tickets. */
const M: MuseumSelectionInput = { isResident: true, date: '15/10/2026', time: '10:00', quantity: '3' }
/** Y with a distinctive security code, to search for it in the result. */
const Y: PaymentInput = {
  method: 'credit',
  cardNumber: '4111111111111111',
  holder: 'Ana Sofía Ríos Vela',
  expiry: '12/28',
  securityCode: '987',
  email: '',
}
const PAYPAL: PaymentInput = { ...Y, method: 'paypal', email: 'ana@example.com' }

function context(overrides: Partial<ConfirmationContext> = {}, target: Venue = SCALA): ConfirmationContext {
  return {
    userLimit: target.category === 'museo' ? 5 : 10,
    available: target.capacity,
    today: TODAY,
    sequence: 1,
    ...overrides,
  }
}

const theater = (input: TheaterSelectionInput): TicketsInput => ({ category: 'teatro', input })
const cinema = (input: CinemaSelectionInput): TicketsInput => ({ category: 'cine', input })
const museum = (input: MuseumSelectionInput): TicketsInput => ({ category: 'museo', input })

describe('confirmPurchase — boletos y después pago (RN-CON-02)', () => {
  it('CF1: teatro completo', () => {
    const confirmation = confirmPurchase(SCALA, theater(B), Y, context())
    expect(confirmation.ok).toBe(true)
    if (!confirmation.ok || confirmation.purchase.category !== 'teatro') return
    const { purchase } = confirmation
    expect(purchase.folio).toBe('PLC-0001-2026')
    expect(purchase.amount).toBe(250000)
    expect(purchase.dressCode).toBe(SCALA.dressCode)
    expect(purchase.restrictions).toBe(SCALA.restrictions)
    expect(purchase.purchasedOn).toEqual(TODAY)
  })

  it('CF2: cine completo con PayPal', () => {
    const confirmation = confirmPurchase(CINEPOLIS, cinema(K), PAYPAL, context({}, CINEPOLIS))
    expect(confirmation.ok).toBe(true)
    if (!confirmation.ok || confirmation.purchase.category !== 'cine') return
    expect(confirmation.purchase).toMatchObject({ seats: [12, 13], subtotal: 56000, feeTotal: 1200, amount: 57200 })
    expect(confirmation.purchase.payment).toEqual({ method: 'paypal', email: 'ana@example.com' })
  })

  it('CF3: museo completo', () => {
    const confirmation = confirmPurchase(LOUVRE, museum(M), Y, context({}, LOUVRE))
    expect(confirmation.ok).toBe(true)
    if (!confirmation.ok || confirmation.purchase.category !== 'museo') return
    expect(confirmation.purchase).toMatchObject({ fee: 2200, feeKind: 'resident', amount: 6600, entryNote: LOUVRE.entryNote })
  })

  it.each([
    ['CF4', SCALA, theater({ ...B, date: '02/10/2026' }), { ...Y, holder: '' }, context(), 'tickets', 'date', null, 'ERR_DATE_PAST'],
    ['CF5', SCALA, theater(B), { ...Y, cardNumber: '6011111111111117' }, context(), 'payment', 'cardNumber', null, 'ERR_CARD_BRAND_REJECTED'],
    ['CF6', CINEPOLIS, cinema({ ...K, quantity: '3', seats: ['11', '12', '12'] }), Y, context({}, CINEPOLIS), 'tickets', 'seats', 2, 'ERR_SEAT_REPEATED'],
    ['CF7', SCALA, theater({ ...B, quantity: '6' }), Y, context({ available: 5 }), 'tickets', 'quantity', null, 'ERR_EXCEEDS_AVAILABILITY'],
    ['CF8', SCALA, theater({ ...B, quantity: '1' }), Y, context({ available: 0 }), 'tickets', 'quantity', null, 'ERR_EXCEEDS_AVAILABILITY'],
    ['CF9', SCALA, theater({ ...B, quantity: '11' }), Y, context({ available: 5 }), 'tickets', 'quantity', null, 'ERR_EXCEEDS_USER_LIMIT'],
    ['CF10', SCALA, theater(B), Y, context({ today: { year: 2026, month: 10, day: 6 } }), 'tickets', 'date', null, 'ERR_DATE_PAST'],
    ['CF11', SCALA, cinema(K), Y, context(), 'tickets', null, null, 'ERR_INPUT_INVALID'],
    ['CF12', SCALA, theater(B), Y, context({ sequence: 0 }), 'tickets', null, null, 'ERR_INPUT_INVALID'],
  ] as const)('%s → %s, %s, %s, %s', (_, target, tickets, payment, ctx, step, field, seatIndex, code) => {
    const confirmation = confirmPurchase(target, tickets, payment, ctx)
    expect(confirmation.ok).toBe(false)
    if (confirmation.ok) return
    expect(confirmation.step).toBe(step)
    expect(confirmation.field).toBe(field)
    expect(confirmation.seatIndex).toBe(seatIndex)
    expect(confirmation.result.code).toBe(code)
  })

  it('CF13: la compra nunca lleva el número completo ni el código (RNF-15)', () => {
    for (const confirmation of [
      confirmPurchase(SCALA, theater(B), Y, context()),
      confirmPurchase(LOUVRE, museum(M), Y, context({}, LOUVRE)),
    ]) {
      expect(confirmation.ok).toBe(true)
      if (!confirmation.ok) continue
      const serialized = JSON.stringify(confirmation.purchase)
      expect(serialized).not.toContain('4111111111111111')
      expect(serialized).not.toContain('987')
      expect(confirmation.purchase.payment).toMatchObject({ maskedNumber: '************1111' })
    }
  })

  it('CF14: el año del folio es el de la compra', () => {
    const confirmation = confirmPurchase(
      SCALA,
      theater({ ...B, date: '05/01/2027' }),
      Y,
      context({ today: { year: 2027, month: 1, day: 4 } }),
    )
    expect(confirmation.ok && confirmation.purchase.folio).toBe('PLC-0001-2027')
  })

  it('CF15: sin tarifa diferenciada, residente paga la general', () => {
    const confirmation = confirmPurchase(
      MET,
      museum({ isResident: true, date: '15/10/2026', time: '10:00', quantity: '1' }),
      Y,
      context({}, MET),
    )
    expect(confirmation.ok).toBe(true)
    if (!confirmation.ok || confirmation.purchase.category !== 'museo') return
    expect(confirmation.purchase).toMatchObject({ feeKind: 'general', fee: 3000 })
  })
})

describe('confirmPurchase con un método guardado', () => {
  const SAVED: SavedPaymentMethod = {
    id: '9c5b1f7e-2d4a-4e8b-9f3a-1b2c3d4e5f60',
    method: 'credit',
    brand: 'visa',
    last4: '1111',
    holder: 'Ana Sofía Ríos Vela',
    expiry: '12/28',
  }

  it('CF16: boletos inválidos y método inexistente → tickets, en el orden de RN-CON-02', () => {
    const confirmation = confirmPurchase(SCALA, theater({ ...B, date: '02/10/2026' }), { kind: 'saved', saved: null, securityCode: '123' }, context())
    expect(confirmation).toMatchObject({ ok: false, step: 'tickets', field: 'date', result: { code: 'ERR_DATE_PAST' } })
  })

  it('CF17: boletos válidos y método inexistente → payment, savedMethod', () => {
    const confirmation = confirmPurchase(SCALA, theater(B), { kind: 'saved', saved: null, securityCode: '123' }, context())
    expect(confirmation).toMatchObject({ ok: false, step: 'payment', field: 'savedMethod', result: { code: 'ERR_SAVED_METHOD_UNAVAILABLE' } })
  })

  it('CF18: tarjeta guardada vencida → payment, savedMethod, ERR_CARD_EXPIRED', () => {
    const confirmation = confirmPurchase(SCALA, theater(B), { kind: 'saved', saved: { ...SAVED, expiry: '09/26' }, securityCode: '123' }, context())
    expect(confirmation).toMatchObject({ ok: false, step: 'payment', field: 'savedMethod', result: { code: 'ERR_CARD_EXPIRED' } })
  })

  it('CF19: todo válido → la compra lleva el resumen del método guardado', () => {
    const confirmation = confirmPurchase(SCALA, theater(B), { kind: 'saved', saved: SAVED, securityCode: '123' }, context())
    expect(confirmation.ok).toBe(true)
    if (!confirmation.ok) return
    expect(confirmation.purchase.payment).toEqual({ method: 'credit', brand: 'visa', maskedNumber: '************1111', holder: 'Ana Sofía Ríos Vela' })
    // The same summary as the typed card (INV18).
    expect(confirmation.purchase.payment).toEqual(capturedSummary())
  })
})

function capturedSummary() {
  const paid = evaluatePayment(Y, TODAY)
  return paid.ok ? paid.payment : null
}

describe('invariantes de la confirmación', () => {
  // Valid bases and one rejection per field of each composite.
  const THEATER_INPUTS: TheaterSelectionInput[] = [
    B,
    { ...B, playIndex: 9 },
    { ...B, sectionIndex: 9 },
    { ...B, date: '02/10/2026' },
    { ...B, date: '04/10/2026' },
    { ...B, time: '25:00' },
    { ...B, time: '20:00' },
    { ...B, quantity: '11' },
  ]
  const PAYMENTS: PaymentInput[] = [
    Y,
    PAYPAL,
    { ...Y, cardNumber: '6011111111111117' },
    { ...Y, holder: '' },
    { ...Y, expiry: '09/26' },
    { ...Y, securityCode: '12' },
    { ...PAYPAL, email: 'ana@' },
  ]
  const UNIVERSE = THEATER_INPUTS.flatMap((tickets) => PAYMENTS.map((payment) => ({ tickets, payment })))
  const ctx = context()

  it('INV11: la compra da OK si y solo si boletos y pago dan OK por separado', () => {
    expect(UNIVERSE).toHaveLength(56)
    for (const { tickets, payment } of UNIVERSE) {
      const separately =
        evaluateTheaterSelection(SCALA, tickets, ctx.userLimit, ctx.available, TODAY).ok && evaluatePayment(payment, TODAY).ok
      expect(confirmPurchase(SCALA, theater(tickets), payment, ctx).ok, JSON.stringify({ tickets, payment })).toBe(separately)
    }
  })

  it('INV12: el motivo de la compra es el de su paso y su campo', () => {
    for (const { tickets, payment } of UNIVERSE) {
      const confirmation = confirmPurchase(SCALA, theater(tickets), payment, ctx)
      if (confirmation.ok) continue
      const selection = evaluateTheaterSelection(SCALA, tickets, ctx.userLimit, ctx.available, TODAY)
      const label = JSON.stringify({ tickets, payment })
      if (confirmation.step === 'tickets') {
        expect(selection.ok, label).toBe(false)
        if (!selection.ok) {
          expect(selection.field, label).toBe(confirmation.field)
          expect(selection.result.code, label).toBe(confirmation.result.code)
        }
      } else {
        expect(selection.ok, label).toBe(true)
        const paid = evaluatePayment(payment, TODAY)
        expect(paid.ok, label).toBe(false)
        if (!paid.ok) {
          expect(paid.field, label).toBe(confirmation.field)
          expect(paid.result.code, label).toBe(confirmation.result.code)
        }
      }
    }
  })
})
