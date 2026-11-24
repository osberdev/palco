import { writeFileSync } from 'node:fs'

/**
 * Differential API tool. It walks a fixed sequence of HTTP requests and writes a
 * normalized JSON file, so two builds can be compared with `diff`. It imports
 * nothing from the application: it only sees what a client sees.
 *
 *   SNAPSHOT_TODAY=2026-11-01 node scripts/api-snapshot.mjs http://127.0.0.1:3920 salida.json
 *
 * The server must start on a freshly seeded database, without the Meta
 * configuration and with `NUXT_AVAILABILITY_OVERRIDES=teatro-metropolitan=2`, so
 * the availability rejection is reachable. `SNAPSHOT_TODAY` is the page clock: the
 * purchase dates come from it and never go stale, and it must be the same in both runs.
 *
 * Exits with 1 if a response does not have the expected status, so two equally
 * broken builds are not accepted, and with 2 if the conditions above are not met.
 */

const [baseUrl, outputFile] = process.argv.slice(2)
const today = process.env.SNAPSHOT_TODAY ?? ''

if (!baseUrl || !outputFile || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error('Uso: SNAPSHOT_TODAY=AAAA-MM-DD node scripts/api-snapshot.mjs URL_BASE SALIDA.json')
  process.exit(2)
}

// ── Dates ────────────────────────────────────────────────────────────────────

// Fixed dates on which some venue in the script is closed.
const CLOSED_DAYS = new Set(['1/1', '25/4', '1/5', '15/8', '16/9', '25/12'])

/** A Thursday at least 40 days ahead: the Scala, the Louvre and the Metropólitan are open. */
function eventDate() {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 40)
  while (date.getUTCDay() !== 4 || CLOSED_DAYS.has(`${date.getUTCDate()}/${date.getUTCMonth() + 1}`)) {
    date.setUTCDate(date.getUTCDate() + 1)
  }
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`
}

const EVENT_DATE = eventDate()
const PAST_DATE = '02/03/2020'

// ── Normalization ────────────────────────────────────────────────────────────

const markers = new Map()

/** The same value always gives the same marker, numbered in order of appearance. */
function marker(kind, value) {
  const key = `${kind}:${value}`
  if (!markers.has(key)) {
    const count = [...markers.keys()].filter((known) => known.startsWith(`${kind}:`)).length + 1
    markers.set(key, `<${kind}-${count}>`)
  }
  return markers.get(key)
}

// The QR goes first: it contains the ticket id.
const PATTERNS = [
  ['qr', /\bP1\.[0-9A-Z]+\.[0-9A-Z]+\b/g],
  ['folio', /\bPLC-[0-9A-F]{4,}-\d{4}\b/g],
  ['codigo', /\b[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}\b/g],
  ['uuid', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g],
  ['marca', /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g],
]

function normalizeText(text) {
  // Nitro errors carry the `url`, with each server's port.
  const local = text.replaceAll(baseUrl, '<base>')
  return PATTERNS.reduce((current, [kind, pattern]) => current.replace(pattern, (value) => marker(kind, value)), local)
}

/** Keeps the key order as received. `purchasedOn` is the server clock. */
function normalize(value, key = '') {
  if (typeof value === 'string') return normalizeText(value)
  if (Array.isArray(value)) return value.map((item) => normalize(item))
  if (value === null || typeof value !== 'object') return value
  if (key === 'purchasedOn') return Object.fromEntries(Object.keys(value).map((part) => [part, '<fecha-de-compra>']))
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, normalize(item, name)]))
}

function normalizeCookie(cookie) {
  return cookie
    .replace(/^([^=]+)=[^;]*/, (_, name) => `${name}=<cookie>`)
    .replace(/Expires=[^;]*/i, 'Expires=<marca>')
}

// ── Client ───────────────────────────────────────────────────────────────────

const HEADERS = ['content-type', 'cache-control', 'x-content-type-options', 'content-disposition', 'retry-after']
const steps = []
const mismatches = []

function client() {
  let cookie = ''
  return async function request(name, expected, method, path, body, raw) {
    const headers = {}
    if (cookie) headers.Cookie = cookie
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
    const setCookies = response.headers.getSetCookie()
    const session = setCookies.find((line) => line.startsWith('palco_session='))
    if (session) cookie = session.split(';')[0]

    const bytes = Buffer.from(await response.arrayBuffer())
    const type = response.headers.get('content-type') ?? ''
    let parsed = null
    let content
    if (type.includes('application/json')) {
      parsed = JSON.parse(bytes.toString('utf8'))
      content = parsed
    }
    else {
      // Binary: the PDF changes with every signature and creation date.
      content = { bytesAreBinary: true, magic: bytes.subarray(0, 4).toString('latin1').replace(/[^\x20-\x7e]/g, '?') }
    }

    const shown = Object.fromEntries(HEADERS.flatMap((header) => {
      const found = response.headers.get(header)
      return found === null ? [] : [[header, normalizeText(found)]]
    }))
    steps.push({
      name,
      request: `${method} ${normalizeText(path)}`,
      status: response.status,
      headers: shown,
      cookies: setCookies.map(normalizeCookie),
      body: normalize(content),
    })
    if (response.status !== expected) mismatches.push(`${name}: esperado ${expected}, recibido ${response.status}`)
    return { status: response.status, json: parsed }
  }
}

function abort(message) {
  console.error(`No se cumplen las condiciones del guion: ${message}`)
  process.exit(2)
}

// ── Synthetic data ───────────────────────────────────────────────────────────

const ANA = { username: 'RIVA030315MJCSLNA2JC', password: '!Palco26' }
const BRUNO = { username: 'TENB010908HCMLVRA6CM', password: 'Teatro9$' }

const CREDIT = { method: 'credit', cardNumber: '4111111111111111', holder: 'Ana Sofía Ríos Vela', expiry: '12/40', securityCode: '123', email: '' }
const DEBIT = { method: 'debit', cardNumber: '5555555555554444', holder: 'Ana Sofía Ríos Vela', expiry: '12/40', securityCode: '123', email: '' }
const PAYPAL = { method: 'paypal', cardNumber: '', holder: '', expiry: '', securityCode: '', email: 'ana.rios@example.com' }

const theater = (date, quantity) => ({ playIndex: 0, sectionIndex: 0, date, time: '15:00', quantity })
const CINEMA = { filmIndex: 3, age: '21', formatId: 'vip', date: EVENT_DATE, time: '19:00', quantity: '2', seats: ['12', '13'] }
const MUSEUM = { isResident: true, date: EVENT_DATE, time: '10:00', quantity: '3' }

const requestId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`

/** A 128 × 128 PNG header: the domain decides from the leading bytes (RN-PER-06). */
function photoBytes() {
  const size = Buffer.alloc(8)
  size.writeUInt32BE(128, 0)
  size.writeUInt32BE(128, 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
    Buffer.from('IHDR'),
    size,
    Buffer.from([8, 6, 0, 0, 0, 0, 0, 0, 0]),
  ])
}

// ── The script ───────────────────────────────────────────────────────────────

const ana = client()
const bruno = client()
const visitor = client()

// 1. Sign-in.
await ana('login de Ana', 200, 'POST', '/api/auth/login', ANA)
await bruno('login de Bruno', 200, 'POST', '/api/auth/login', BRUNO)
await visitor('login inválido', 401, 'POST', '/api/auth/login', { username: ANA.username, password: 'Zzzzzz9$' })
await ana('sesión de Ana', 200, 'GET', '/api/auth/session')
await visitor('sesión sin cookie', 200, 'GET', '/api/auth/session')

// 2. Catalog.
const catalog = await ana('catálogo', 200, 'GET', '/api/catalog')
const venues = catalog.json?.venues ?? []
if (venues.find((venue) => venue.id === 'teatro-metropolitan')?.available !== 2) {
  abort('el Metropólitan debe tener 2 lugares: arranca con NUXT_AVAILABILITY_OVERRIDES=teatro-metropolitan=2 sobre una base recién sembrada')
}
await visitor('catálogo sin sesión', 401, 'GET', '/api/catalog')

// 3. Detail of the twelve venues.
if (venues.length !== 12) abort(`se esperaban 12 recintos y hay ${venues.length}`)
for (const venue of venues) await ana(`detalle de ${venue.id}`, 200, 'GET', `/api/venues/${venue.id}`)
await ana('recinto inexistente', 404, 'GET', '/api/venues/opera')

// 4. One purchase per category, and the retry.
const scalaBody = { requestId: requestId(1), venueId: 'teatro-scala', tickets: theater(EVENT_DATE, '3'), payment: CREDIT }
const scala = await ana('compra en teatro con crédito', 201, 'POST', '/api/purchases', scalaBody)
const cinema = await ana('compra en cine con débito', 201, 'POST', '/api/purchases', { requestId: requestId(2), venueId: 'cinepolis', tickets: CINEMA, payment: DEBIT })
const museum = await ana('compra en museo con PayPal', 201, 'POST', '/api/purchases', { requestId: requestId(3), venueId: 'louvre', tickets: MUSEUM, payment: PAYPAL })
await ana('reintento con el mismo requestId', 200, 'POST', '/api/purchases', scalaBody)
await ana('el mismo requestId con otra compra', 400, 'POST', '/api/purchases', { ...scalaBody, tickets: theater(EVENT_DATE, '4') })
const folios = [scala, cinema, museum].map((purchase) => purchase.json?.folio)
if (folios.some((folio) => typeof folio !== 'string')) {
  console.error(`Las compras no se confirmaron: ${mismatches.join('; ')}`)
  process.exit(1)
}

// 5. Rejections.
await ana('rechazo por fecha pasada', 400, 'POST', '/api/purchases', { requestId: requestId(4), venueId: 'teatro-scala', tickets: theater(PAST_DATE, '1'), payment: CREDIT })
await ana('rechazo por cantidad mayor que lo libre', 400, 'POST', '/api/purchases', { requestId: requestId(5), venueId: 'teatro-metropolitan', tickets: theater(EVENT_DATE, '3'), payment: CREDIT })

// 6. List and details.
await ana('lista de compras de Ana', 200, 'GET', '/api/purchases')
for (const folio of folios) await ana(`detalle de ${normalizeText(folio)}`, 200, 'GET', `/api/purchases/${folio}`)
await ana('PDF de los boletos', 200, 'GET', `/api/purchases/${folios[0]}/tickets`)

// The send, without a saved WhatsApp number: it never reaches Meta.
const status = await ana('estado del envío', 200, 'GET', `/api/purchases/${folios[0]}/whatsapp`)
if (status.json?.available !== false) abort('el servidor tiene la configuración de Meta: arráncalo sin ella')
await ana('enviar sin configuración de Meta', 503, 'POST', `/api/purchases/${folios[0]}/whatsapp`)

// 7. Another user.
await bruno('Bruno pide un folio de Ana', 404, 'GET', `/api/purchases/${folios[0]}`)
await bruno('Bruno pide el PDF de Ana', 404, 'GET', `/api/purchases/${folios[0]}/tickets`)
await bruno('lista de compras de Bruno', 200, 'GET', '/api/purchases')

// 8. Payment method: add, edit, purchase with it and remove.
const added = await ana('alta de un método', 201, 'POST', '/api/payment-methods', { method: 'credit', cardNumber: '5105105105105100', holder: 'Ana Sofía Ríos Vela', expiry: '12/40' })
const methodId = added.json?.method?.id
await ana('el mismo método otra vez', 400, 'POST', '/api/payment-methods', { method: 'debit', cardNumber: '5105105105105100', holder: 'Ana Sofía Ríos Vela', expiry: '12/40' })
await ana('lista de métodos', 200, 'GET', '/api/payment-methods')
await ana('edición del método', 200, 'PATCH', `/api/payment-methods/${methodId}`, { holder: 'Ana Ríos', expiry: '11/40' })
await bruno('Bruno edita un método de Ana', 404, 'PATCH', `/api/payment-methods/${methodId}`, { holder: 'Bruno', expiry: '11/40' })
await ana('compra con el método guardado', 201, 'POST', '/api/purchases', { requestId: requestId(6), venueId: 'teatro-scala', tickets: theater(EVENT_DATE, '1'), payment: { savedMethodId: methodId, securityCode: '123' } })
await ana('baja del método', 200, 'DELETE', `/api/payment-methods/${methodId}`)
await ana('baja de un método que ya no existe', 404, 'DELETE', `/api/payment-methods/${methodId}`)
await ana('lista de métodos vacía', 200, 'GET', '/api/payment-methods')

// 9. Synthetic WhatsApp number: a sample Spanish mobile, not a Mexican one.
const WHATSAPP = { country: 'ES', number: '612345678', consent: true }
await ana('WhatsApp sin guardar', 200, 'GET', '/api/profile/whatsapp')
await ana('WhatsApp sin consentimiento', 400, 'PUT', '/api/profile/whatsapp', { ...WHATSAPP, consent: false })
await ana('guardar WhatsApp', 200, 'PUT', '/api/profile/whatsapp', WHATSAPP)
await ana('consultar WhatsApp', 200, 'GET', '/api/profile/whatsapp')
await ana('quitar WhatsApp', 200, 'DELETE', '/api/profile/whatsapp')
await ana('WhatsApp quitado', 200, 'GET', '/api/profile/whatsapp')

// The rest of what goes through the repositories: photo and registration.
await ana('foto sin subir', 404, 'GET', '/api/profile/photo')
await ana('subir foto', 200, 'PUT', '/api/profile/photo', undefined, photoBytes())
await ana('consultar foto', 200, 'GET', '/api/profile/photo')
await ana('quitar foto', 200, 'DELETE', '/api/profile/photo')
await ana('foto quitada', 404, 'GET', '/api/profile/photo')

const REGISTRATION = { username: 'LOMA081014MJCPRRA6JC', displayName: 'Lucía Pérez', email: 'Lucia.Perez@Example.com', password: 'Abc123$%', passwordConfirmation: 'Abc123$%' }
await client()('registro', 201, 'POST', '/api/auth/register', REGISTRATION)
await client()('registro de una CURP ya dada de alta', 400, 'POST', '/api/auth/register', REGISTRATION)

// Availability after all of the above.
await ana('catálogo al final', 200, 'GET', '/api/catalog')

writeFileSync(outputFile, `${JSON.stringify({ steps }, null, 2)}\n`)
console.info(`${steps.length} pasos escritos en ${outputFile}`)
if (mismatches.length > 0) {
  console.error(`Estados inesperados:\n  ${mismatches.join('\n  ')}`)
  process.exit(1)
}
