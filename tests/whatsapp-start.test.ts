import { beforeEach, describe, expect, it } from 'vitest'
import { findWhatsappSend, resetWhatsappSends } from '../server/data/whatsapp-sends'
import type { StoredWhatsapp } from '../server/db/whatsapp.repository'
import { cents } from '../server/domain/money'
import type { MetaResponse, WhatsappConfig } from '../server/utils/whatsapp-client'
import { startTicketsSend, type StartSendDeps } from '../server/utils/whatsapp-start'
import type { Purchase } from '../types'

// Starting a send, shared by "Enviar a WhatsApp" and the automatic send
// (RN-ENV-02 and 04), with a fake client. Each case carries its identifier in its
// name.

const T = 10_000_000
const USER = 1
const FOLIO = 'PLC-0001-2026'

const CONFIG: WhatsappConfig = {
  accessToken: 'token-de-prueba',
  phoneNumberId: 'phone-de-prueba',
  template: 'palco_boletos',
  language: 'es_MX',
  apiBase: 'http://127.0.0.1:9',
  apiVersion: 'v26.0',
}

const STORED: StoredWhatsapp = { e164: '+523312345678', verified: false, consentedAt: '2026-10-17 12:00:00' }

const PURCHASE: Purchase = {
  folio: FOLIO,
  purchasedOn: { year: 2026, month: 10, day: 17 },
  venueId: 'met',
  venueName: 'The Metropolitan Museum of Art',
  city: 'Nueva York, EE.UU.',
  currency: 'USD',
  date: { year: 2026, month: 11, day: 21 },
  time: { hour: 10, minute: 0 },
  quantity: 3,
  amount: cents(9000),
  payment: { method: 'paypal', email: 'ana@example.com' },
  restrictions: '',
  category: 'museo',
  fee: cents(3000),
  feeKind: 'general',
  entryNote: '',
}

const accepted: MetaResponse = { status: 200, body: { messages: [{ id: 'wamid.X' }] } }

interface Fake {
  readonly deps: StartSendDeps
  readonly uploads: string[]
  readonly sends: string[]
  /** The parameters of each sent template, in order. */
  readonly bodies: (readonly string[])[]
}

function fake(overrides: Partial<StartSendDeps> = {}): Fake {
  const uploads: string[] = []
  const sends: string[] = []
  const bodies: (readonly string[])[] = []
  const deps: StartSendDeps = {
    config: CONFIG,
    whatsapp: async () => STORED,
    buyerName: async () => 'Ana Sofía Ríos Vela',
    pdf: async () => new Uint8Array([37, 80, 68, 70]),
    upload: async (_config, _bytes, filename) => {
      uploads.push(filename)
      return { status: 200, body: { id: `media-${uploads.length}` } }
    },
    send: async (_config, to, mediaId, message) => {
      sends.push(`${to}:${mediaId}`)
      bodies.push(message.body)
      return accepted
    },
    now: () => T,
    sleep: async () => {},
    log: () => {},
    report: () => {},
    ...overrides,
  }
  return { deps, uploads, sends, bodies }
}

beforeEach(() => {
  resetWhatsappSends()
})

describe('inicio del envío', () => {
  it('AU1: sin configuración, unavailable y nada en la bandeja', async () => {
    const f = fake({ config: null })
    expect(await startTicketsSend(USER, PURCHASE, T, f.deps)).toEqual({ kind: 'unavailable' })
    expect(findWhatsappSend(USER, FOLIO)).toBeNull()
    expect(f.uploads).toEqual([])
  })

  it('AU2: sin número, notRegistered y nada en la bandeja', async () => {
    const f = fake({ whatsapp: async () => null })
    expect(await startTicketsSend(USER, PURCHASE, T, f.deps)).toEqual({ kind: 'notRegistered' })
    expect(findWhatsappSend(USER, FOLIO)).toBeNull()
    expect(f.uploads).toEqual([])
  })

  it('AU3: con número, started; la bandeja tiene el envío y el cliente recibe la subida', async () => {
    const f = fake()
    const started = await startTicketsSend(USER, PURCHASE, T, f.deps)
    expect(started.kind).toBe('started')
    expect(findWhatsappSend(USER, FOLIO)).toMatchObject({ state: 'sending', started: [T] })
    if (started.kind === 'started') await started.done
    expect(f.uploads).toEqual(['PALCO-PLC-0001-2026.pdf'])
    expect(f.sends).toEqual(['+523312345678:media-1'])
    expect(findWhatsappSend(USER, FOLIO)).toMatchObject({ state: 'sent', wamid: 'wamid.X', started: [T] })
  })

  it('AU4: con un envío en curso, inProgress sin contar', async () => {
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const f = fake({ pdf: async () => {
      await blocked
      return new Uint8Array([37])
    } })
    const first = await startTicketsSend(USER, PURCHASE, T, f.deps)
    expect(first.kind).toBe('started')
    expect(await startTicketsSend(USER, PURCHASE, T + 1000, f.deps)).toEqual({ kind: 'inProgress' })
    expect(findWhatsappSend(USER, FOLIO)!.started).toEqual([T])
    release()
    if (first.kind === 'started') await first.done
    expect(f.uploads).toHaveLength(1)
  })

  it('AU5: con tres envíos en la hora, limited con su espera', async () => {
    const f = fake()
    for (const offset of [0, 60_000, 120_000]) {
      const started = await startTicketsSend(USER, PURCHASE, T + offset, f.deps)
      expect(started.kind).toBe('started')
      if (started.kind === 'started') await started.done
    }
    const fourth = await startTicketsSend(USER, PURCHASE, T + 180_000, f.deps)
    expect(fourth).toMatchObject({ kind: 'limited', retryAfterSeconds: 3420 })
    if (fourth.kind === 'limited') expect(fourth.result.code).toBe('ERR_WHATSAPP_SEND_LIMIT')
    expect(findWhatsappSend(USER, FOLIO)!.started).toHaveLength(3)
    expect(f.uploads).toHaveLength(3)
  })

  it('AU6: si armar el PDF lanza, no lanza y el envío termina en failed', async () => {
    const reports: unknown[] = []
    const f = fake({
      pdf: async () => {
        throw new Error('sin fuentes')
      },
      report: (_folio, error) => {
        reports.push(error)
      },
    })
    const started = await startTicketsSend(USER, PURCHASE, T, f.deps)
    expect(started.kind).toBe('started')
    if (started.kind === 'started') await started.done
    expect(findWhatsappSend(USER, FOLIO)).toMatchObject({
      state: 'failed',
      failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: false },
    })
    expect(reports).toHaveLength(1)
    expect(f.uploads).toEqual([])
  })

  // The database reads come before the outbox: a failure neither counts as a send nor
  // leaves it stuck in `sending`.
  it('AU9: si falla la lectura del número o del comprador, lanza y la bandeja queda sin el envío', async () => {
    const reading = new Error('la base no responde')
    const reject = async () => {
      throw reading
    }
    await expect(startTicketsSend(USER, PURCHASE, T, fake({ whatsapp: reject }).deps)).rejects.toBe(reading)
    expect(findWhatsappSend(USER, FOLIO)).toBeNull()

    await expect(startTicketsSend(USER, PURCHASE, T, fake({ buyerName: reject }).deps)).rejects.toBe(reading)
    expect(findWhatsappSend(USER, FOLIO)).toBeNull()

    // And it can be retried: nothing was counted.
    const started = await startTicketsSend(USER, PURCHASE, T, fake().deps)
    expect(started.kind).toBe('started')
    if (started.kind === 'started') await started.done
  })

  // The message is built before uploading, so without a buyer the PDF, which carries
  // the name, the folio and the QR codes, is not uploaded either.
  it('AU7: sin comprador para la v2, el envío falla sin subir el PDF ni enviar un mensaje incompleto', async () => {
    const reports: unknown[] = []
    const f = fake({
      config: { ...CONFIG, template: 'palco_boletos_v2' },
      buyerName: async () => null,
      report: (_folio, error) => {
        reports.push(error)
      },
    })
    const started = await startTicketsSend(USER, PURCHASE, T, f.deps)
    expect(started.kind).toBe('started')
    if (started.kind === 'started') await expect(started.done).resolves.toBeUndefined()
    expect(findWhatsappSend(USER, FOLIO)).toMatchObject({
      state: 'failed',
      failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: false },
      started: [T],
    })
    expect(f.uploads).toEqual([])
    expect(f.sends).toEqual([])
    expect(reports).toHaveLength(1)
  })

  it('AU8: el comprador se consulta una vez por envío, aunque haya reintentos, y la original recibe sus 4 parámetros', async () => {
    for (const template of ['palco_boletos_v2', 'palco_boletos'] as const) {
      resetWhatsappSends()
      let lookups = 0
      let attempt = 0
      const f = fake({
        config: { ...CONFIG, template },
        buyerName: async () => {
          lookups += 1
          return 'Ana Sofía Ríos Vela'
        },
      })
      const send = f.deps.send
      const deps: StartSendDeps = {
        ...f.deps,
        // Two transient failures and then accepted: three attempts (RN-ENV-03).
        send: async (config, to, mediaId, message) => {
          attempt += 1
          const answered = await send(config, to, mediaId, message)
          return attempt < 3 ? { status: 500, body: { error: { code: 1 } } } : answered
        },
      }
      const started = await startTicketsSend(USER, PURCHASE, T, deps)
      if (started.kind === 'started') await started.done
      expect(findWhatsappSend(USER, FOLIO)).toMatchObject({ state: 'sent' })
      expect(f.bodies).toHaveLength(3)
      expect(lookups).toBe(1)
      const expected = template === 'palco_boletos_v2'
        ? ['Ana Sofía Ríos Vela', FOLIO, '3 boletos', 'The Metropolitan Museum of Art', 'sábado 21 nov 2026 a las 10:00', 'USD 90.00 con PayPal']
        : [FOLIO, '3 boletos', 'The Metropolitan Museum of Art', 'sábado 21 nov 2026 a las 10:00']
      for (const body of f.bodies) expect(body).toEqual(expected)
    }
  })
})
