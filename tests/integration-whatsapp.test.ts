import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockMetaServer, type MockMetaRequest, type MockMetaScenario } from '../scripts/mock-meta-server'
import type { TicketFonts } from '../server/utils/ticket-pdf'
import type { PurchaseDetail } from '../types'
import { freezeClock, thawClock } from './helpers/clock'
import { createHarness, SEEDED_USERS, type Harness, type HarnessClient } from './helpers/http-harness'

// WhatsApp send integration (INT9): the real endpoints, the real database and the
// real Meta client talking over HTTP to the simulated Meta of
// scripts/mock-meta-server.ts on a free port. The WhatsApp number is synthetic and
// lives only in this test: it is never written to a file or to the output, and the
// recipient is compared as a boolean so a failure does not print it. Without the
// transient scenario: WE13 covers its delays.

const ROOT = resolve(import.meta.dirname, '..')
const [ANA, BRUNO] = SEEDED_USERS
const TOKEN = 'token-sintetico-de-int9'
const NUMBER = { country: 'MX', number: '33 1234 5678' }
const E164 = '+523312345678'
const SECRETS = [TOKEN, E164, E164.slice(1), '3312345678', NUMBER.number]

interface Received {
  readonly entry: MockMetaRequest
  readonly body: Buffer
}

let harness: Harness
let mock: Server | null = null
let received: Received[] = []
const captured: string[] = []

async function startMock(scenario: MockMetaScenario): Promise<void> {
  if (mock) await new Promise<void>((done) => mock!.close(() => done()))
  received = []
  const server = createMockMetaServer({
    scenario,
    keepBodies: true,
    mediaIdPrefix: `media-${scenario}-`,
    onRequest: (entry, body) => received.push({ entry, body }),
  })
  mock = server
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  await harness.configureWhatsapp({
    NUXT_WHATSAPP_ACCESS_TOKEN: TOKEN,
    NUXT_WHATSAPP_PHONE_NUMBER_ID: 'phone-sintetico',
    NUXT_WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba-sintetica',
    NUXT_WHATSAPP_TICKET_TEMPLATE: 'palco_boletos_v2',
    NUXT_WHATSAPP_TEMPLATE_LANGUAGE: 'es_MX',
    NUXT_WHATSAPP_API_BASE: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  })
}

async function signedIn(user: (typeof SEEDED_USERS)[number]): Promise<HarnessClient> {
  const client = harness.client()
  expect((await client.login(user.username, user.password)).status).toBe(200)
  return client
}

/** What a response leaves in the test output, to search for leaks. */
function keep<T extends { bytes: Buffer, json: unknown }>(response: T): T {
  if (response.json !== null) captured.push(response.bytes.toString('utf8'))
  return response
}

async function buy(client: HarnessClient): Promise<string> {
  const response = keep(await client.post('/api/purchases', {
    requestId: randomUUID(),
    venueId: 'cinepolis',
    tickets: { filmIndex: 3, age: '21', formatId: 'vip', date: '07/11/2026', time: '19:00', quantity: '2', seats: ['12', '13'] },
    payment: { method: 'debit', cardNumber: '5555555555554444', holder: 'Elena Vela Torres', expiry: '12/28', securityCode: '987', email: '' },
  }))
  expect(response.status).toBe(201)
  return (response.json as { folio: string }).folio
}

/** Polls the send status until it stops sending. */
async function settled(client: HarnessClient, folio: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = keep(await client.get(`/api/purchases/${folio}/whatsapp`))
    const json = status.json as { state: string }
    if (json.state !== 'sending') return status.json as { state: string, failure: { code: string, metaCode: number | null, offline: boolean } | null, remaining: number }
    await new Promise((done) => setTimeout(done, 25))
  }
  throw new Error('El envío no terminó')
}

beforeAll(async () => {
  freezeClock()
  harness = await createHarness()
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      captured.push(args.map(String).join(' '))
    })
  }
})

afterAll(async () => {
  if (mock) await new Promise<void>((done) => mock!.close(() => done()))
  await harness?.close()
  thawClock()
})

describe('envío a WhatsApp', () => {
  beforeEach(() => harness.resetSales())

  it('INT9: el envío automático sube el PDF de la compra y envía la plantilla; los errores de Meta quedan en su estado; sin fugas', async () => {
    const ana = await signedIn(ANA)
    expect(keep(await ana.put('/api/profile/whatsapp', { ...NUMBER, consent: true })).status).toBe(200)

    // ── ok: the purchase triggers the send ──
    await startMock('ok')
    const folio = await buy(ana)
    const status = await settled(ana, folio)
    expect(status.state).toBe('sent')
    expect(received.map((r) => [r.entry.resource, r.entry.status])).toEqual([['media', 200], ['messages', 200]])
    const [upload, send] = received as [Received, Received]
    const message = JSON.parse(send.body.toString('utf8')) as {
      to: string
      template: { name: string, components: { type: string, parameters: { document?: { id: string, filename: string }, text?: string }[] }[] }
    }
    const header = message.template.components.find((component) => component.type === 'header')!.parameters[0]!.document!
    const parameters = message.template.components.find((component) => component.type === 'body')!.parameters.map((p) => p.text)
    expect(message.template.name).toBe('palco_boletos_v2')
    // The send uses that upload's id, never an earlier one.
    expect(header.id).toBe(upload.entry.id)
    expect(header.filename).toBe(`PALCO-${folio}.pdf`)
    expect(header.id).toBe('media-ok-1')
    expect(parameters).toEqual([ANA.displayName, folio, '2 boletos', 'Cinépolis', 'sábado 7 nov 2026 a las 19:00', 'MXN 572.00 con Tarjeta de débito Mastercard'])
    expect(parameters.join(' ')).not.toMatch(/Elena|4444|\*|987|@/)
    // The recipient is the saved WhatsApp number, without the "+"; as a boolean, so a
    // failure does not print the number.
    expect(message.to === E164.slice(1)).toBe(true)

    // The PDF Meta received is the one from GET /tickets, built from that purchase's
    // pages: buyer, method, total, QR and short code.
    const pdfStart = upload.body.indexOf('%PDF-')
    const pdfEnd = upload.body.lastIndexOf('%%EOF')
    const uploadedPdf = upload.body.subarray(pdfStart, pdfEnd + '%%EOF'.length + 1)
    const downloaded = await ana.get(`/api/purchases/${folio}/tickets`)
    expect(downloaded.status).toBe(200)
    expect(uploadedPdf.equals(downloaded.bytes)).toBe(true)

    const detail = (await ana.get(`/api/purchases/${folio}`)).json as PurchaseDetail
    const { ticketPages } = await harness.load<typeof import('../utils/ticket-pages')>('utils/ticket-pages.ts')
    const { TICKET_FONT_FILES, renderTicketsPdf } = await harness.load<typeof import('../server/utils/ticket-pdf')>('server/utils/ticket-pdf.ts')
    const fonts = Object.fromEntries(Object.entries(TICKET_FONT_FILES).map(([key, file]) => [key, readFileSync(join(ROOT, 'server/assets/fonts', file))])) as unknown as TicketFonts
    const pages = ticketPages(detail, detail.tickets, ANA.displayName)
    expect(pages).toHaveLength(2)
    pages.forEach((page, index) => {
      expect(page.buyer).toBe(`A nombre de ${ANA.displayName}`)
      expect(page.paymentLabel).toBe('Tarjeta de débito Mastercard')
      expect(page.totalLabel).toBe('MXN 572.00')
      expect(page.qrPayload).toBe(detail.tickets[index]!.qrPayload)
      expect(page.shortCode).toBe(detail.tickets[index]!.shortCode)
    })
    expect((await renderTicketsPdf(pages, fonts, new Date())).equals(uploadedPdf)).toBe(true)

    // A resend uploads the PDF again and uses that new upload's id.
    const resend = keep(await ana.post(`/api/purchases/${folio}/whatsapp`))
    expect(resend.status).toBe(202)
    expect((await settled(ana, folio)).state).toBe('sent')
    expect(received.map((r) => [r.entry.resource, r.entry.id])).toEqual([
      ['media', 'media-ok-1'], ['messages', 'wamid.mock-1'], ['media', 'media-ok-2'], ['messages', 'wamid.mock-2'],
    ])
    const resent = JSON.parse(received[3]!.body.toString('utf8')) as typeof message
    expect(resent.template.name).toBe('palco_boletos_v2')
    expect(resent.template.components.find((component) => component.type === 'body')!.parameters.map((p) => p.text)).toEqual(parameters)
    expect(resent.template.components.find((component) => component.type === 'header')!.parameters[0]!.document!.id).toBe('media-ok-2')

    // ── unreachable: 131030, no retries ──
    await startMock('unreachable')
    const unreachable = await settled(ana, await buy(ana))
    expect(unreachable).toMatchObject({ state: 'failed', failure: { code: 'ERR_WHATSAPP_UNREACHABLE', metaCode: 131030, offline: false } })
    expect(received.map((r) => r.entry.resource)).toEqual(['media', 'messages'])

    // ── permanent: 132001, no retries ──
    await startMock('permanent')
    const permanent = await settled(ana, await buy(ana))
    expect(permanent).toMatchObject({ state: 'failed', failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: 132001, offline: false } })
    expect(received.map((r) => r.entry.resource)).toEqual(['media', 'messages'])

    // ── without the Meta configuration: 503 ──
    await harness.configureWhatsapp(null)
    const unavailable = keep(await ana.post(`/api/purchases/${folio}/whatsapp`))
    expect(unavailable.status).toBe(503)
    expect(unavailable.json).toMatchObject({ ok: false, code: 'ERR_WHATSAPP_UNAVAILABLE' })

    // ── without a WhatsApp number on the profile: 409 ──
    await startMock('ok')
    const bruno = await signedIn(BRUNO)
    const brunoFolio = await buy(bruno)
    expect(received).toEqual([])
    const notRegistered = keep(await bruno.post(`/api/purchases/${brunoFolio}/whatsapp`))
    expect(notRegistered.status).toBe(409)
    expect(notRegistered.json).toMatchObject({ ok: false, code: 'ERR_WHATSAPP_NOT_REGISTERED' })
    expect(received).toEqual([])

    // ── no output carries the token, the number or the E.164 form ──
    captured.push(...received.map((r) => JSON.stringify(r.entry)))
    const output = captured.join('\n')
    expect(output.length).toBeGreaterThan(0)
    expect(SECRETS.filter((secret) => output.includes(secret))).toEqual([])
  })
})
