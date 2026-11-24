import {
  checkExitCode,
  classifyPhoneCheck,
  classifyRecipientCheck,
  classifyTemplateCheck,
  classifyTokenCheck,
  parseCheckArguments,
  type CheckLine,
} from '../server/utils/whatsapp-check.ts'
import { parseWhatsappConfig } from '../server/utils/whatsapp-config.ts'

// Pre-flight check for sending: `bun run whatsapp:check`. It only queries. With
// `-- --send-test CURP` it also sends `hello_world` to the WhatsApp number that
// user saved in the database, because the test number's recipient list cannot be
// queried. The number comes from the database and only its mask is written; the
// token, never.

const TIMEOUT_MS = 10_000
/** The sample template every test account has; it is not PALCO's. */
const RECIPIENT_TEMPLATE = { name: 'hello_world', language: { code: 'en_US' } }

interface Reply {
  readonly status: number
  readonly body: unknown
}

async function request(url: string, token: string, init: RequestInit = {}): Promise<Reply> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  }
  catch {
    return { status: 0, body: null }
  }
  try {
    return { status: response.status, body: await response.json() }
  }
  catch {
    return { status: response.status, body: null }
  }
}

const LABELS = { ok: 'OK    ', warn: 'AVISO ', fail: 'FALLA ' } as const

const lines: CheckLine[] = []
const report = (line: CheckLine): void => {
  lines.push(line)
  console.info(`${LABELS[line.level]} ${line.message}`)
}

const args = parseCheckArguments(process.argv.slice(2))
if (!args.ok) {
  console.error(`FALLA  ${args.message}`)
  process.exit(1)
}

const parsed = parseWhatsappConfig(process.env)
if (!parsed.ok) {
  if (parsed.missing.length > 0) console.error(`FALLA  Configuración: faltan ${parsed.missing.join(', ')}`)
  if (parsed.invalid.length > 0) console.error(`FALLA  Configuración: no son válidas ${parsed.invalid.join(', ')}`)
  console.error('—      Sin configuración no se consulta a Meta')
  process.exit(1)
}

const config = parsed.config
const accountId = (process.env.NUXT_WHATSAPP_BUSINESS_ACCOUNT_ID ?? '').trim()
const graph = `${config.apiBase}/${config.apiVersion}`
const token = config.accessToken

console.info(`Graph API ${config.apiVersion} en ${config.apiBase}`)

const debug = await request(`${graph}/debug_token?input_token=${encodeURIComponent(token)}`, token)
report(classifyTokenCheck(debug.status, debug.body, Math.floor(Date.now() / 1000)))

const fields = 'display_phone_number,verified_name,quality_rating,platform_type'
const phone = await request(`${graph}/${encodeURIComponent(config.phoneNumberId)}?fields=${fields}`, token)
report(classifyPhoneCheck(phone.status, phone.body))

const templateFields = 'name,language,status,category,components,rejected_reason'
const templates = await request(
  `${graph}/${encodeURIComponent(accountId)}/message_templates?name=${encodeURIComponent(config.template)}&fields=${templateFields}&limit=100`,
  token,
)
report(classifyTemplateCheck(templates.status, templates.body, config.template, config.language))

if (args.sendTest === null) {
  console.info('—      Destino: sin revisar; --send-test CURP envía hello_world al WhatsApp de ese usuario')
}
else {
  report(await sendTest(args.sendTest))
}

process.exit(checkExitCode(lines))

/** Looks up the user's WhatsApp number and sends it `hello_world`; the database is only opened here. */
async function sendTest(curp: string): Promise<CheckLine> {
  if (!process.env.NUXT_DATABASE_URL) return { level: 'fail', message: 'Destino: falta NUXT_DATABASE_URL en .env' }
  const { closeDatabase } = await import('../server/db/client.ts')
  const { findUserRowByUsername } = await import('../server/db/users.repository.ts')
  const { findWhatsapp } = await import('../server/db/whatsapp.repository.ts')
  const { maskWhatsapp } = await import('../server/domain/whatsapp.ts')
  const { describeDatabaseFailure } = await import('../server/utils/database-startup.ts')
  try {
    const user = await findUserRowByUsername(curp)
    if (!user) return { level: 'fail', message: `Destino: no hay un usuario con la CURP ${curp}` }
    const stored = await findWhatsapp(user.id)
    if (!stored) return { level: 'fail', message: `Destino: ${curp} no tiene WhatsApp en su perfil` }
    const masked = maskWhatsapp(stored.e164)
    if (!masked.ok) return { level: 'fail', message: `Destino: el WhatsApp guardado de ${curp} no es un E.164 reconocible` }
    const sent = await request(`${graph}/${encodeURIComponent(config.phoneNumberId)}/messages`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: stored.e164.slice(1),
        type: 'template',
        template: RECIPIENT_TEMPLATE,
      }),
    })
    return classifyRecipientCheck(sent.status, sent.body, masked.value)
  }
  catch (error) {
    // The same message as the db:* scripts, without a stack trace or password.
    const failure = describeDatabaseFailure(error, process.env.NUXT_DATABASE_URL ?? '')
    return { level: 'fail', message: `Destino: ${failure.ok ? 'no se pudo leer la base' : failure.message}` }
  }
  finally {
    await closeDatabase()
  }
}
