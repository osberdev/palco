import { describe, expect, it } from 'vitest'
import { launchTicketsSend, runTicketsSend, type SendDeps, type SendJob } from '../server/utils/whatsapp-sender'
import type { MetaResponse } from '../server/utils/whatsapp-client'

// Sending with retries (RN-ENV-03), with a fake client, clock and `sleep`. Each
// case carries its identifier in its name.

const TO = '+523312345678'
const TOKEN = 'EAAG-token-de-prueba'

const accepted = (wamid = 'wamid.HBgM'): MetaResponse => ({ status: 200, body: { messages: [{ id: wamid }] } })
const uploaded = (id: string): MetaResponse => ({ status: 200, body: { id } })
const metaError = (status: number, code: number): MetaResponse => ({ status, body: { error: { code, message: TOKEN } } })
const offline: MetaResponse = { status: 0, body: null }

interface Fake {
  readonly deps: SendDeps
  readonly uploads: string[]
  readonly sends: string[]
  readonly sleeps: number[]
  readonly logs: string[]
}

/** Responses in order: upload and send responses go in separate lists. */
function fake(uploadResponses: readonly MetaResponse[], sendResponses: readonly MetaResponse[]): Fake {
  const uploads: string[] = []
  const sends: string[] = []
  const sleeps: number[] = []
  const logs: string[] = []
  let clock = 1_000_000
  let mediaCounter = 0
  const deps: SendDeps = {
    upload: async (bytes, filename) => {
      uploads.push(`${filename}:${bytes.length}`)
      const response = uploadResponses[uploads.length - 1] ?? offline
      // An accepted upload returns a new id each time.
      return response.status === 200 && response.body !== null ? uploaded(`media-${++mediaCounter}`) : response
    },
    send: async (to, mediaId) => {
      sends.push(mediaId)
      return sendResponses[sends.length - 1] ?? offline
    },
    now: () => (clock += 37),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    log: (line) => {
      logs.push(JSON.stringify(line))
    },
  }
  return { deps, uploads, sends, sleeps, logs }
}

const JOB: SendJob = {
  folio: 'PLC-0001-2026',
  to: TO,
  filename: 'PALCO-PLC-0001-2026.pdf',
  pdf: async () => new Uint8Array([37, 80, 68, 70]),
}

describe('envío con reintentos', () => {
  it('WE12: éxito al primer intento', async () => {
    const f = fake([uploaded('x')], [accepted('wamid.UNO')])
    expect(await runTicketsSend(JOB, f.deps)).toEqual({ state: 'sent', wamid: 'wamid.UNO' })
    expect(f.uploads).toEqual(['PALCO-PLC-0001-2026.pdf:4'])
    expect(f.sends).toEqual(['media-1'])
    expect(f.sleeps).toEqual([])
  })

  it('WE13: dos transitorios y después el éxito, a los 2 y a los 8 segundos', async () => {
    const f = fake([uploaded('x'), uploaded('x'), uploaded('x')], [metaError(500, 1), metaError(400, 130429), accepted()])
    expect(await runTicketsSend(JOB, f.deps)).toEqual({ state: 'sent', wamid: 'wamid.HBgM' })
    expect(f.sleeps).toEqual([2000, 8000])
    expect(f.uploads).toHaveLength(3)
  })

  it('WE14: tres transitorios terminan en fallo, sin un cuarto intento', async () => {
    const f = fake([uploaded('x'), uploaded('x'), uploaded('x'), uploaded('x')], [metaError(500, 1), metaError(500, 1), metaError(500, 1), accepted()])
    expect(await runTicketsSend(JOB, f.deps)).toEqual({
      state: 'failed',
      failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: 1, offline: false },
    })
    expect(f.uploads).toHaveLength(3)
    expect(f.sends).toHaveLength(3)
    expect(f.sleeps).toEqual([2000, 8000])
  })

  it('WE15: inalcanzable y permanente, un solo intento', async () => {
    const unreachable = fake([uploaded('x')], [metaError(400, 131030)])
    expect(await runTicketsSend(JOB, unreachable.deps)).toEqual({
      state: 'failed',
      failure: { code: 'ERR_WHATSAPP_UNREACHABLE', metaCode: 131030, offline: false },
    })
    expect(unreachable.uploads).toHaveLength(1)
    const permanent = fake([uploaded('x')], [metaError(404, 132001)])
    expect(await runTicketsSend(JOB, permanent.deps)).toEqual({
      state: 'failed',
      failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: 132001, offline: false },
    })
    expect(permanent.uploads).toHaveLength(1)
    expect(permanent.sleeps).toEqual([])
  })

  it('WE16: una subida fallida cuenta como intento', async () => {
    const f = fake([offline, offline, offline], [])
    expect(await runTicketsSend(JOB, f.deps)).toEqual({
      state: 'failed',
      failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: true },
    })
    expect(f.uploads).toHaveLength(3)
    expect(f.sends).toEqual([])
    const mixed = fake([metaError(500, 1), uploaded('x')], [accepted()])
    expect(await runTicketsSend(JOB, mixed.deps)).toMatchObject({ state: 'sent' })
    expect(mixed.sleeps).toEqual([2000])
  })

  it('WE17: cada envío usa el id de la subida inmediatamente anterior', async () => {
    const f = fake([uploaded('x'), metaError(500, 1), uploaded('x')], [metaError(500, 1), accepted()])
    expect(await runTicketsSend(JOB, f.deps)).toMatchObject({ state: 'sent' })
    // Uploads: media-1, failed, media-2. Sends: media-1 and media-2; media-1 is never
    // reused after its send failed.
    expect(f.sends).toEqual(['media-1', 'media-2'])
  })

  it('WE18: el registro no lleva el número ni el token', async () => {
    const f = fake([uploaded('x'), uploaded('x')], [metaError(500, 1), accepted()])
    await runTicketsSend(JOB, f.deps)
    expect(f.logs.length).toBe(4)
    for (const line of f.logs) {
      expect(line).not.toContain('3312345678')
      expect(line).not.toContain(TOKEN)
      expect(JSON.parse(line)).toMatchObject({ event: 'whatsapp', folio: 'PLC-0001-2026' })
    }
    expect(f.logs.map((line) => JSON.parse(line).step)).toEqual(['upload', 'send', 'upload', 'send'])
    expect(JSON.parse(f.logs[3]!)).toMatchObject({ attempt: 2, status: 200, code: null, wamid: 'wamid.HBgM' })
    expect(JSON.parse(f.logs[1]!)).toMatchObject({ attempt: 1, status: 500, code: 1, wamid: null })
  })
})

describe('envío sin esperar', () => {
  it('WE22: una excepción inesperada deja el envío en failed, sin rechazar', async () => {
    const f = fake([], [])
    const finished: unknown[] = []
    const reported: unknown[] = []
    const job: SendJob = { ...JOB, pdf: async () => { throw new Error('pdfmake') } }
    await expect(launchTicketsSend(job, f.deps, (result) => finished.push(result), (error) => reported.push(error))).resolves.toBeUndefined()
    expect(finished).toEqual([{ state: 'failed', failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: false } }])
    expect(reported).toHaveLength(1)
  })
})
