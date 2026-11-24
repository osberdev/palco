import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import bcrypt from 'bcrypt'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VENUES } from '../server/data/catalog'
import { insertPurchase } from '../server/db/purchases.repository'
import { saveWhatsapp } from '../server/db/whatsapp.repository'
import { DEMO_PURCHASES, demoRecords } from '../scripts/demo-purchases'
import { evidenceExitCode, evidenceReport, POLICY_DESCRIPTIONS } from '../scripts/evidence-report'
import { formatShortCode } from '../server/domain/ticket'
import { createTestDatabase, type TestDatabase } from './support/database'

// `bun run db:evidence` and the simulated Meta, on PGlite. The report runs as
// `palco_lector`, like the script. The database has the real schema, the four seed
// users with their bcrypt hash, the sample purchases and a synthetic WhatsApp
// number. Each case carries its identifier in its name.

const ROOT = resolve(import.meta.dirname, '..')
// Emails of the three kinds `db:evidence` distinguishes: on a domain reserved for
// testing, which is shown; on a non-reserved one, which is hidden; and null, like a
// registered user without email. The non-reserved one is on palco.mx, a domain that
// exists.
const RESERVED_EMAIL = 'ana.usuaria@example.com'
const UNRESERVED_EMAIL = 'bruno.tellez@palco.mx'
const USERS = [
  ['RIVA030315MJCSLNA2JC', '!Palco26', 'Ana Sofía Ríos Vela', RESERVED_EMAIL],
  ['TENB010908HCMLVRA6CM', 'Teatro9$', 'Bruno Téllez Nava', UNRESERVED_EMAIL],
  ['IASC951122MQTBLR02QT', 'Cine#204', 'Carmen Ibarra Solís', null],
  ['MEXD980704HNLNXG10NL', 'Museo$7A', 'Diego Méndez', 'diego@palco.test'],
] as const
// The synthetic number of WA1 (tests/whatsapp.test.ts).
const E164 = '+523312345678'

let database: TestDatabase
let hashes: string[] = []

const report = (target = database) => target.asRole('palco_lector', () => evidenceReport(target, VENUES))

beforeAll(async () => {
  database = await createTestDatabase()
  hashes = await database.asOwner(async () => {
    const stored: string[] = []
    for (const [username, password, name, email] of USERS) {
      const hash = bcrypt.hashSync(password, 10)
      await database.query('INSERT INTO users (username, password_hash, display_name, email) VALUES ($1, $2, $3, $4)', [username, hash, name, email])
      stored.push(hash)
    }
    return stored
  })
  let counter = 0
  const demo = await demoRecords(database, { year: 2026, month: 10, day: 26 }, () => {
    counter += 1
    return new Uint8Array(10).fill(counter)
  })
  if (!demo.ok) throw new Error(demo.message)
  for (const record of demo.records) await insertPurchase(record, database)
  await saveWhatsapp(1, E164, database)
})

afterAll(() => database.close())

describe('db:evidence', () => {
  it('EV1: el informe lleva el prefijo del hash y su longitud, y ningún hash completo', async () => {
    const { text } = await report()
    expect(text).toContain('$2b$10$…')
    expect(text).toMatch(/\$2b\$10\$…\s+60\s+10/)
    expect(hashes).toHaveLength(4)
    for (const hash of hashes) {
      expect(hash).toHaveLength(60)
      expect(text).not.toContain(hash)
      // Not even a fragment of the hash beyond the prefix.
      expect(text).not.toContain(hash.slice(7, 20))
    }
  })

  // The users section has an email column, so what is forbidden is specific: the
  // holder, the PayPal email and the email of a user outside the domains reserved
  // for testing.
  it('EV2: sin titulares, correos de PayPal ni de dominios no reservados, números de 13 a 19 dígitos ni el número de WhatsApp', async () => {
    const { text } = await report()
    const holders = DEMO_PURCHASES.flatMap((demo) => (demo.payment.method === 'paypal' ? [] : [demo.payment.holder]))
    const emails = DEMO_PURCHASES.flatMap((demo) => (demo.payment.method === 'paypal' ? [demo.payment.email] : []))
    expect(holders).toHaveLength(3)
    expect(emails).toHaveLength(2)
    for (const sensitive of [...holders, ...emails]) expect(text).not.toContain(sensitive)
    expect(text).not.toMatch(/\d{13,19}/)
    expect(text).not.toContain(UNRESERVED_EMAIL)
    expect(text).not.toContain('palco.mx')
    // The email column: the reserved one is shown, the other one hidden, the null one is "—".
    expect(text).toContain(RESERVED_EMAIL)
    expect(text).toContain('diego@palco.test')
    expect(text).toContain('registrado (dominio no reservado, oculto)')
    expect(text).toMatch(/Carmen Ibarra Solís\s+—\s+IASC951122MQTBLR02QT/)
    expect(text.match(/@/g)).toHaveLength(2)
    // WhatsApp is reported as "sí" or "no": the reader cannot read the number.
    expect(text).toMatch(/Ana Sofía Ríos Vela\s.*\ssí$/m)
    expect(text).toMatch(/Bruno Téllez Nava\s.*\sno$/m)
    expect(text).not.toContain('···')
    for (const form of [E164, E164.slice(1), '3312345678', '33 1234 5678', '33123']) expect(text).not.toContain(form)

    // The sections that read the views: history and payments are present, and they
    // contain no holders, PayPal emails, masks or the number.
    const between = (start: string, end: string) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)))
    const history = between('Historial de compras por usuario (vista purchase_history)', '━━ Eventos')
    const payments = between('━━ Pagos y transacciones', '━━ Boletos')
    expect(history).toContain('PLC-0005-2026')
    expect(payments).toMatch(/PLC-0003-2026\s+3\s+Museo del Louvre\s+\S+ \S+\s+PayPal\s+—/)
    for (const rewritten of [history, payments]) {
      expect(rewritten.length).toBeGreaterThan(0)
      for (const sensitive of [...holders, ...emails, '*', '4111', '@']) expect(rewritten).not.toContain(sensitive)
    }
  })

  it('EV3: con la base consistente termina con 0; con boletos de menos, con 1 y nombra la compra', async () => {
    const clean = await report()
    expect(clean.failures).toEqual([])
    expect(evidenceExitCode(clean)).toBe(0)
    expect(clean.text).toContain('Todas las comprobaciones de consistencia pasan.')

    // A deliberately corrupted copy: the second purchase is missing a ticket.
    const corrupted = await database.copy()
    try {
      await corrupted.asOwner(() => corrupted.query("DELETE FROM tickets WHERE folio = 'PLC-0002-2026' AND ordinal = 3"))
      const broken = await report(corrupted)
      expect(broken.failures).toEqual(['PLC-0002-2026: cantidad 3, boletos 2'])
      expect(evidenceExitCode(broken)).toBe(1)
      expect(broken.text).toContain('PLC-0002-2026: cantidad 3, boletos 2')
    }
    finally {
      await corrupted.close()
    }
  })

  // The schedules and the listings live in the database.
  it('EV9: horarios, cierres, excepciones y cartelera por recinto, leídos de la base', async () => {
    const { text } = await report()
    expect(text).toMatch(/horarios\s+sí\s/)
    expect(text).toMatch(/cartelera\s+sí\s/)
    expect(text).not.toContain('no en la base')
    const hours = text.slice(text.indexOf('━━ Eventos: horarios, cierres y cartelera'), text.indexOf('━━ Pagos y transacciones'))
    // A schedule only appears with the policy that uses it, and each policy carries
    // its description.
    expect(hours).toContain('louvre: alterno 09:00–21:45 · domingo y festivos — · cierra mar')
    expect(hours).toContain('excepciones: NIGHT_HOURS (horario alterno los miércoles y viernes) · cierres anuales: 1/1 Año Nuevo · 1/5 Día del Trabajo · 25/12 Navidad')
    expect(hours).toContain('excepciones: OPENS_ON_HOLIDAY (abre en un festivo aunque caiga en su día de cierre), SEASONAL_HOURS (horario alterno de mayo a septiembre), SUNDAY_HOLIDAY_HOURS (horario reducido los domingos y festivos)')
    // Without a schedule policy, "—" in both; without a closing day, "sin cierre semanal".
    expect(hours).toContain('teatro-colon: alterno — · domingo y festivos — · cierra dom')
    expect(hours).toContain('cinepolis: alterno — · domingo y festivos — · sin cierre semanal')
    expect(hours).toContain('mnac: alterno 10:00–20:00 · domingo y festivos 10:00–15:00 · cierra lun')
    expect(hours).not.toContain('cierra ninguno')
    // Each of the seven policies appears with its description from the map.
    for (const [policy, description] of Object.entries(POLICY_DESCRIPTIONS)) expect(hours).toContain(`${policy} (${description})`)
    expect(Object.keys(POLICY_DESCRIPTIONS)).toHaveLength(7)
    expect(hours).toContain('obras: Aida (Verdi) · La bohème (Puccini) · El lago de los cisnes (Chaikovski)')
    expect(hours).toContain('Insidious (C, 112 min)')
    expect(hours.match(/^ {2}[a-z-]+: alterno /gm)).toHaveLength(12)
  })

  /** The short code of the seed's first ticket: its bytes are all 1. */
  const FIRST_CODE = (() => {
    const code = formatShortCode(new Uint8Array(10).fill(1))
    if (!code.ok) throw new Error('código corto')
    return code.value
  })()

  /** A copy with ticket 1 of PLC-0001-2026 admitted at noon, in the process time zone, `days` days after its event. */
  async function withAdmission(days: number): Promise<TestDatabase> {
    const copy = await database.copy()
    const ticket = (await copy.query<{ id: string, event_date: string }>(
      "SELECT t.id, p.event_date FROM tickets t JOIN purchases p ON p.folio = t.folio WHERE t.folio = 'PLC-0001-2026' AND t.ordinal = 1",
    )).rows[0]!
    const [year, month, day] = ticket.event_date.split('-').map(Number)
    await copy.query('INSERT INTO admissions (ticket_id, admitted_at) VALUES ($1, $2)', [ticket.id, new Date(year!, month! - 1, day! + days, 12, 0, 5).toISOString()])
    return copy
  }

  it('EV10: los ingresos, con su boleto, su código y la hora en la zona del proceso; en su fecha, la consistencia pasa', async () => {
    expect((await report()).text).toContain('Sin ingresos.')
    const copy = await withAdmission(0)
    try {
      const result = await report(copy)
      const section = result.text.slice(result.text.indexOf('━━ Ingresos'), result.text.indexOf('━━ Consistencia'))
      const quantity = (await copy.query<{ quantity: number }>("SELECT quantity FROM purchases WHERE folio = 'PLC-0001-2026'")).rows[0]!.quantity
      expect(section).toMatch(new RegExp(`PLC-0001-2026\\s+1 de ${quantity}\\s+${FIRST_CODE}\\s+.+\\s+(\\d{4}-\\d\\d-\\d\\d)\\s+\\1 12:00:05`))
      expect(result.text).toContain('Ingresos en la fecha de su evento: 1 de 1')
      expect(result.failures).toEqual([])
    }
    finally {
      await copy.close()
    }
  })

  it('EV11: un ingreso fuera de la fecha de su evento hace fallar la evidencia y nombra el boleto', async () => {
    const copy = await withAdmission(-1)
    try {
      const result = await report(copy)
      expect(result.failures).toHaveLength(1)
      expect(result.failures[0]).toMatch(new RegExp(`^PLC-0001-2026, boleto 1 de \\d+ \\(${FIRST_CODE}\\): ingreso el (\\d{4}-\\d\\d-\\d\\d), el evento es el (?!\\1)\\d{4}-\\d\\d-\\d\\d$`))
      expect(evidenceExitCode(result)).toBe(1)
      expect(result.text).toContain('Ingresos en la fecha de su evento: 0 de 1')
    }
    finally {
      await copy.close()
    }
  })

  it('EV4: la conexión es de solo lectura', async () => {
    await expect(database.asRole('palco_lector', () => database.query("INSERT INTO venue_sections (venue_id, position, name, price_cents) VALUES ('teatro-scala', 99, 'x', 1)")))
      .rejects.toMatchObject({ code: '42501' })
  })
})

describe('palco_lector', () => {
  const asLector = (sql: string) => database.asRole('palco_lector', () => database.query(sql))

  it('EV8: no lee el número de WhatsApp ni los bytes de la foto, y lee lo demás que la verificación necesita', async () => {
    await expect(asLector('SELECT e164 FROM whatsapp_numbers')).rejects.toMatchObject({ code: '42501' })
    await expect(asLector('SELECT * FROM whatsapp_numbers')).rejects.toMatchObject({ code: '42501' })
    await expect(asLector('SELECT data FROM profile_photos')).rejects.toMatchObject({ code: '42501' })
    await expect(asLector('SELECT user_id, verified, consented_at FROM whatsapp_numbers')).resolves.toBeDefined()
    await expect(asLector('SELECT holder, last4, expiry, email FROM payment_methods')).resolves.toBeDefined()
    await expect(asLector('SELECT password_hash, email FROM users')).resolves.toBeDefined()
    await expect(asLector('SELECT payment_summary, fingerprint FROM purchases')).resolves.toBeDefined()
  })
})

describe('semilla de la demostración', () => {
  // db:evidence prints the user's email: a PayPal account equal to a user email
  // would show on screen even though the report never reads the payment summary.
  it('EV7: las cuentas de PayPal de la demostración no son correos de usuario de la semilla', () => {
    const seed = readFileSync(join(ROOT, 'scripts/db-seed.ts'), 'utf8')
    const userEmails = [...seed.matchAll(/email: '([^']+)'/g)].map((match) => match[1])
    const paypal = DEMO_PURCHASES.flatMap((demo) => (demo.payment.method === 'paypal' ? [demo.payment.email] : []))
    expect(userEmails).toHaveLength(4)
    for (const email of userEmails) expect(email).toMatch(/@example\.com$/)
    expect(paypal.length).toBeGreaterThan(0)
    for (const account of paypal) expect(userEmails).not.toContain(account)
  })
})

describe('Meta simulado', () => {
  /** Starts the server on a free port and returns its address and its process. */
  async function start(scenario: string) {
    const child = spawn('node', [join(ROOT, 'scripts/mock-meta.mjs'), scenario, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const base = await new Promise<string>((resolveBase, rejectBase) => {
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8')
        const match = /Escuchando en (http:\/\/127\.0\.0\.1:\d+)/.exec(output)
        if (match) resolveBase(match[1]!)
      })
      child.on('exit', (code) => rejectBase(new Error(`El Meta simulado terminó con ${code}`)))
    })
    return { base, stop: () => new Promise<void>((done) => { child.on('exit', () => done()); child.kill() }) }
  }

  async function send(base: string) {
    const response = await fetch(`${base}/v26.0/phone-sintetico/messages`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer token-sintetico', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: '0', type: 'template' }),
    })
    const body = await response.json() as { error?: { code?: number }, messages?: { id: string }[] }
    return { status: response.status, code: body.error?.code ?? null, accepted: Array.isArray(body.messages) }
  }

  it('EV5: unreachable responde 400 con 131030; transient-then-ok, dos 500 y después aceptado', async () => {
    const unreachable = await start('unreachable')
    try {
      expect(await send(unreachable.base)).toEqual({ status: 400, code: 131030, accepted: false })
    }
    finally {
      await unreachable.stop()
    }

    const transient = await start('transient-then-ok')
    try {
      const results = [await send(transient.base), await send(transient.base), await send(transient.base)]
      expect(results).toEqual([
        { status: 500, code: 1, accepted: false },
        { status: 500, code: 1, accepted: false },
        { status: 200, code: null, accepted: true },
      ])
    }
    finally {
      await transient.stop()
    }
  })
})
