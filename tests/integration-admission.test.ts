import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freezeClock, NOW, thawClock } from './helpers/clock'
import { createHarness, SEEDED_USERS, type Harness, type HarnessClient } from './helpers/http-harness'

// Admission over HTTP (RN-ACC-03 and 04): the real endpoint with the gate cookie,
// the per-run signature and the `admissions` table. The clock is frozen at NOW,
// Monday October 26, 2026 at 18:00, and Cinépolis opens from 11:00 to 23:30: a
// ticket for today enters. Each case carries its identifier.

const PIN = 'Taquilla-2026'
const [ANA] = SEEDED_USERS

let harness: Harness
let ana: HarnessClient

interface IssuedView {
  readonly shortCode: string
  readonly qrPayload: string
}

/** Buys two Cinépolis tickets as Ana for `date` at 20:00, and returns their codes. */
async function buyCinema(date = '26/10/2026'): Promise<{ readonly folio: string, readonly tickets: readonly IssuedView[] }> {
  const response = await ana.post('/api/purchases', {
    requestId: randomUUID(),
    venueId: 'cinepolis',
    tickets: { filmIndex: 3, age: '21', formatId: 'vip', date, time: '20:00', quantity: '2', seats: ['12', '13'] },
    payment: { method: 'credit', cardNumber: '4111111111111111', holder: 'Elena Vela Torres', expiry: '12/28', securityCode: '987', email: '' },
  })
  expect(response.status, JSON.stringify(response.json)).toBe(201)
  const { folio } = response.json as { folio: string }
  const detail = await ana.get(`/api/purchases/${folio}`)
  return { folio, tickets: (detail.json as { tickets: IssuedView[] }).tickets }
}

/** An open gate at that venue, in its own client: the cookie is not Ana's. */
async function gate(venueId: string): Promise<HarnessClient> {
  const client = harness.client()
  expect((await client.post('/api/gate/open', { venueId, pin: PIN })).status).toBe(200)
  return client
}

const admit = (client: HarnessClient, code: string) => client.post('/api/gate/admissions', { code })

beforeAll(async () => {
  freezeClock()
  harness = await createHarness()
  await harness.configureGate(PIN)
  ana = harness.client()
  expect((await ana.login(ANA!.username, ANA!.password)).status).toBe(200)
})

afterAll(async () => {
  await harness?.close()
  thawClock()
})

beforeEach(async () => {
  freezeClock()
  await harness.resetSales()
})

describe('la admisión', () => {
  it('INT21: el QR entra con 201 y sus datos; la segunda lectura, con el código corto, da 409 con la hora del primero', async () => {
    const { folio, tickets } = await buyCinema()
    const cinepolis = await gate('cinepolis')

    const first = await admit(cinepolis, tickets[1]!.qrPayload)
    expect(first.status).toBe(201)
    expect(first.json).toEqual({
      ok: true,
      ticket: { shortCode: tickets[1]!.shortCode, number: 2, quantity: 2, folio, cells: [{ label: 'FORMATO', value: 'VIP' }, { label: 'ASIENTO', value: '13' }] },
      admittedAt: NOW.toISOString(),
    })
    // Nothing about the buyer or the payment.
    expect(JSON.stringify(first.json)).not.toMatch(/Ana|Elena|1111|987|P1\./)

    const second = await admit(cinepolis, tickets[1]!.shortCode.toLowerCase().replaceAll('-', ''))
    expect(second.status).toBe(409)
    expect(second.json).toEqual({
      ok: false, code: 'ERR_TICKET_ALREADY_USED', message: 'Este boleto ya se usó', detail: null, shortCode: tickets[1]!.shortCode, admittedAt: NOW.toISOString(),
    })

    // The purchase's other ticket enters separately.
    expect((await admit(cinepolis, tickets[0]!.shortCode)).status).toBe(201)
    const rows = await harness.database().query<{ ticket_id: string }>('SELECT ticket_id FROM admissions ORDER BY ticket_id')
    expect(rows.rows).toHaveLength(2)
  })

  it('INT22: los ingresos persisten: tras reiniciar, el mismo boleto da 409', async () => {
    const { tickets } = await buyCinema()
    expect((await admit(await gate('cinepolis'), tickets[0]!.shortCode)).status).toBe(201)
    await harness.restart()
    const again = await admit(await gate('cinepolis'), tickets[0]!.shortCode)
    expect(again.status).toBe(409)
    expect((again.json as { admittedAt: string }).admittedAt).toBe(NOW.toISOString())
  })

  it('INT23: una firma alterada es «no auténtico», sin código ni búsqueda; un código corto que no existe, 404', async () => {
    const { tickets } = await buyCinema()
    const cinepolis = await gate('cinepolis')
    const qr = tickets[0]!.qrPayload
    const forged = `${qr.slice(0, -2)}${qr.at(-2) === 'A' ? 'B' : 'A'}${qr.at(-1)}`
    const fake = await admit(cinepolis, forged)
    expect(fake.status).toBe(400)
    expect(fake.json).toEqual({ ok: false, code: 'ERR_TICKET_NOT_AUTHENTIC', message: 'El boleto no es auténtico', detail: null, shortCode: null, admittedAt: null })

    const missing = await admit(cinepolis, '0000-0000-0000-0000')
    expect(missing.status).toBe(404)
    expect(missing.json).toMatchObject({ code: 'ERR_TICKET_NOT_FOUND', message: 'No hay ningún boleto con este código', shortCode: '0000-0000-0000-0000' })
    expect((await harness.database().query('SELECT 1 FROM admissions')).rows).toHaveLength(0)
  })

  it('INT24: otro recinto, con el de la compra y su ciudad, y otra fecha, con la del evento', async () => {
    const { tickets } = await buyCinema()
    const other = await admit(await gate('cinemex'), tickets[0]!.shortCode)
    expect(other.status).toBe(400)
    expect(other.json).toMatchObject({ code: 'ERR_TICKET_OTHER_VENUE', message: 'El boleto es de otro recinto', detail: 'Cinépolis · México', shortCode: tickets[0]!.shortCode })

    const tomorrow = await buyCinema('27/10/2026')
    const later = await admit(await gate('cinepolis'), tomorrow.tickets[0]!.qrPayload)
    expect(later.status).toBe(400)
    expect(later.json).toMatchObject({ code: 'ERR_TICKET_WRONG_DATE', message: 'El boleto es para otra fecha', detail: 'Martes 27 oct 2026, 20:00' })
    expect((await harness.database().query('SELECT 1 FROM admissions')).rows).toHaveLength(0)
  })

  it('INT25: fuera del horario de hoy, con el horario; dentro, entra', async () => {
    const { tickets } = await buyCinema()
    const cinepolis = await gate('cinepolis')
    freezeClock(new Date(2026, 9, 26, 23, 45, 0))
    const late = await admit(cinepolis, tickets[0]!.shortCode)
    expect(late.status).toBe(400)
    expect(late.json).toMatchObject({ code: 'ERR_GATE_OUTSIDE_HOURS', message: 'El recinto está fuera de su horario', detail: 'Abre de 11:00 a 23:30' })
    freezeClock(new Date(2026, 9, 26, 23, 30, 0))
    expect((await admit(cinepolis, tickets[0]!.shortCode)).status).toBe(201)
  })

  it('INT26: la forma del cuerpo y del código', async () => {
    const cinepolis = await gate('cinepolis')
    for (const body of [{}, { code: 7 }, { code: '' }, { code: 'x'.repeat(201) }, { code: 'ABCD-EFGH-JKMN-PQRS', extra: 1 }]) {
      const response = await cinepolis.post('/api/gate/admissions', body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(response.json, JSON.stringify(body)).toMatchObject({ code: 'ERR_INPUT_INVALID' })
    }
    const format = await admit(cinepolis, 'PLC-0001-2026')
    expect(format.status).toBe(400)
    expect(format.json).toMatchObject({ code: 'ERR_TICKET_CODE_FORMAT', message: 'El código no tiene el formato de un boleto de PALCO' })
  })

  it('INT27: sin taquilla abierta, 401; sin configuración, 503; desde otro sitio, 403', async () => {
    const { tickets } = await buyCinema()
    const stranger = harness.client()
    const closed = await admit(stranger, tickets[0]!.shortCode)
    expect(closed.status).toBe(401)
    expect(closed.json).toMatchObject({ code: 'ERR_GATE_CLOSED', message: 'La taquilla se cerró. Vuelve a abrirla' })
    // The buyer's session does not open the gate.
    expect((await admit(ana, tickets[0]!.shortCode)).status).toBe(401)

    const cinepolis = await gate('cinepolis')
    const crossSite = await cinepolis.post('/api/gate/admissions', { code: tickets[0]!.shortCode }, { 'Sec-Fetch-Site': 'cross-site' })
    expect(crossSite.status).toBe(403)

    await harness.configureGate(undefined)
    try {
      expect((await admit(cinepolis, tickets[0]!.shortCode)).status).toBe(503)
    }
    finally {
      await harness.configureGate(PIN)
    }
    expect((await harness.database().query('SELECT 1 FROM admissions')).rows).toHaveLength(0)
  })
})
