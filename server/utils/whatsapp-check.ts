/**
 * The pre-flight check for sending: decides, from Meta's already read responses,
 * whether sending will work. Pure functions: `scripts/whatsapp-check.ts` makes the
 * requests and writes the report. It only imports the template contract, with an
 * explicit extension for Node. No line contains the token or the recipient number.
 */
import { ticketTemplateVariables } from './whatsapp-templates.ts'

export type CheckLevel = 'ok' | 'warn' | 'fail'

export interface CheckLine {
  readonly level: CheckLevel
  readonly message: string
}

/** A token expiring sooner than this triggers a warning. */
export const TOKEN_EXPIRY_WARNING_SECONDS = 14 * 24 * 60 * 60

/** The permissions used by sending (messages) and by the check (templates). */
export const WHATSAPP_REQUIRED_SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSafeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

/**
 * Meta repeats the rejected token in its message ("Malformed access token EAA…").
 * Everything that looks like a token is hidden: the `EAA` prefix of its tokens, or
 * a run of 40 or more characters without spaces.
 */
const TOKEN_LIKE = /EAA[0-9A-Za-z]+|[0-9A-Za-z_-]{40,}/g

/** The Graph error on one line: `HTTP 400, código 190: …`, or no response. */
export function metaErrorText(status: number, body: unknown): string {
  if (status === 0) return 'sin respuesta de Meta'
  const error = isRecord(body) && isRecord(body.error) ? body.error : null
  const code = error && isSafeInteger(error.code) ? `, código ${error.code}` : ''
  const message = error && typeof error.message === 'string' ? `: ${error.message.replace(TOKEN_LIKE, '[token oculto]')}` : ''
  return `HTTP ${status}${code}${message}`
}

function daysText(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  return days === 1 ? '1 día' : `${days} días`
}

/**
 * `GET /debug_token`. Invalid, missing permissions or expired → fail; expires in
 * less than 14 days → warning; `expires_at` 0 is a token without expiry, a system
 * user's. `nowSeconds` arrives as a parameter.
 */
export function classifyTokenCheck(status: number, body: unknown, nowSeconds: number): CheckLine {
  const data = status >= 200 && status < 300 && isRecord(body) && isRecord(body.data) ? body.data : null
  if (!data) return { level: 'fail', message: `Token: no se pudo revisar (${metaErrorText(status, body)})` }
  if (data.is_valid !== true) return { level: 'fail', message: 'Token: Meta lo informa como no válido' }
  const scopes = Array.isArray(data.scopes) ? data.scopes.filter((scope): scope is string => typeof scope === 'string') : []
  const missing = WHATSAPP_REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope))
  if (missing.length > 0) return { level: 'fail', message: `Token: le faltan los permisos ${missing.join(', ')}` }
  const expiresAt = isSafeInteger(data.expires_at) ? data.expires_at : null
  if (expiresAt === null) return { level: 'warn', message: 'Token: válido, sin fecha de vencimiento en la respuesta' }
  if (expiresAt === 0) return { level: 'ok', message: 'Token: válido, sin vencimiento' }
  const left = expiresAt - nowSeconds
  const when = new Date(expiresAt * 1000).toISOString().slice(0, 16).replace('T', ' ')
  if (left <= 0) return { level: 'fail', message: `Token: venció el ${when} UTC` }
  if (left < TOKEN_EXPIRY_WARNING_SECONDS) {
    return { level: 'warn', message: `Token: válido, vence el ${when} UTC, en ${daysText(left)}` }
  }
  return { level: 'ok', message: `Token: válido hasta el ${when} UTC` }
}

/**
 * `GET /{phone-number-id}`. The sender number is PALCO's, not a user's, but only
 * its last four digits are shown, like the mask.
 */
export function classifyPhoneCheck(status: number, body: unknown): CheckLine {
  if (!(status >= 200 && status < 300) || !isRecord(body) || typeof body.display_phone_number !== 'string') {
    return { level: 'fail', message: `Número de envío: no se encontró (${metaErrorText(status, body)})` }
  }
  const digits = body.display_phone_number.replace(/[^0-9]/g, '')
  const name = typeof body.verified_name === 'string' ? ` «${body.verified_name}»` : ''
  const quality = typeof body.quality_rating === 'string' ? `, calidad ${body.quality_rating}` : ''
  const described = `terminado en ${digits.slice(-4)}${name}${quality}`
  if (typeof body.platform_type === 'string' && body.platform_type !== 'CLOUD_API') {
    return { level: 'fail', message: `Número de envío: ${described}, registrado en ${body.platform_type} y no en la Cloud API` }
  }
  return { level: 'ok', message: `Número de envío: ${described}` }
}

interface TemplateComponent {
  readonly type: string
  readonly format: string | null
  readonly text: string
}

function components(value: unknown): readonly TemplateComponent[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((component) => ({
    type: typeof component.type === 'string' ? component.type : '',
    format: typeof component.format === 'string' ? component.format : null,
    text: typeof component.text === 'string' ? component.text : '',
  }))
}

/** The distinct body variables: a repeated `{{1}}` counts once. */
function bodyVariables(text: string): readonly number[] {
  return [...new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b)
}

/**
 * `GET /{waba-id}/message_templates?name=…`. When sending, a missing, in-review or
 * rejected template answers the same way, 132001: here they are told apart by their
 * status. Meta filters by name approximately, so the exact name and language are
 * searched for.
 */
export function classifyTemplateCheck(status: number, body: unknown, name: string, language: string): CheckLine {
  if (!(status >= 200 && status < 300) || !isRecord(body) || !Array.isArray(body.data)) {
    return { level: 'fail', message: `Plantilla: no se pudo consultar (${metaErrorText(status, body)})` }
  }
  const named = body.data.filter(isRecord).filter((template) => template.name === name)
  const template = named.find((candidate) => candidate.language === language)
  if (!template) {
    const languages = named.map((candidate) => candidate.language).filter((code): code is string => typeof code === 'string')
    const others = languages.length > 0 ? `; existe en ${languages.join(', ')}` : ''
    return { level: 'fail', message: `Plantilla ${name} (${language}): no existe${others}` }
  }
  const label = `Plantilla ${name} (${language})`
  const state = typeof template.status === 'string' ? template.status : 'sin estado'
  if (state === 'REJECTED') {
    const reason = typeof template.rejected_reason === 'string' ? template.rejected_reason : 'sin motivo'
    return { level: 'fail', message: `${label}: rechazada, motivo ${reason}` }
  }
  if (state === 'PENDING') return { level: 'fail', message: `${label}: en revisión` }
  if (state !== 'APPROVED') return { level: 'fail', message: `${label}: ${state}` }
  if (template.category !== 'UTILITY') {
    return { level: 'fail', message: `${label}: aprobada, pero de categoría ${String(template.category)} y no UTILITY` }
  }
  const parts = components(template.components)
  const header = parts.find((part) => part.type === 'HEADER')
  if (header?.format !== 'DOCUMENT') {
    return { level: 'fail', message: `${label}: aprobada, pero su encabezado no es DOCUMENT` }
  }
  const variables = bodyVariables(parts.find((part) => part.type === 'BODY')?.text ?? '')
  const expected = ticketTemplateVariables(name)
  if (!expected) return { level: 'fail', message: `${label}: PALCO no tiene implementada esta plantilla` }
  if (variables.length !== expected.length) {
    return {
      level: 'fail',
      message: `${label}: aprobada, pero su cuerpo tiene ${variables.length} variables y PALCO envía ${expected.length}`,
    }
  }
  if (variables.some((variable, index) => variable !== expected[index])) {
    return { level: 'fail', message: `${label}: aprobada, pero las variables deben ser {{1}} a {{${expected.length}}}, sin saltos` }
  }
  return { level: 'ok', message: `${label}: aprobada, de utilidad, con documento y ${expected.length} variables` }
}

export type CheckArguments =
  | { readonly ok: true; readonly sendTest: string | null }
  | { readonly ok: false; readonly message: string }

/**
 * The script arguments: nothing, or `--send-test CURP`. Anything else is rejected,
 * so a mistyped option does not pass through a check without a send.
 */
export function parseCheckArguments(argv: readonly string[]): CheckArguments {
  if (argv.length === 0) return { ok: true, sendTest: null }
  const [option, curp] = argv
  if (argv.length === 2 && option === '--send-test' && curp !== undefined && !curp.startsWith('-')) {
    return { ok: true, sendTest: curp }
  }
  return { ok: false, message: 'Uso: bun run whatsapp:check [-- --send-test CURP]' }
}

/**
 * The `--send-test` message to the user's saved WhatsApp number, of which only the
 * mask is written. Meta does not expose the test number's recipient list: it is
 * only known when sending. 131030 is a number outside the list.
 */
export function classifyRecipientCheck(status: number, body: unknown, masked: string): CheckLine {
  if (status >= 200 && status < 300 && isRecord(body) && Array.isArray(body.messages)) {
    const first: unknown = body.messages[0]
    if (isRecord(first) && typeof first.id === 'string') {
      return { level: 'ok', message: `Destino ${masked}: Meta aceptó hello_world; confirma que llegó al teléfono` }
    }
  }
  const error = isRecord(body) && isRecord(body.error) ? body.error : null
  if (error?.code === 131030) {
    return { level: 'fail', message: `Destino ${masked}: no está en la lista de destinatarios permitidos del número de prueba (131030)` }
  }
  return { level: 'fail', message: `Destino ${masked}: no se pudo enviar (${metaErrorText(status, body)})` }
}

/** The script's exit code: 1 if anything fails; a warning does not change it. */
export function checkExitCode(lines: readonly CheckLine[]): 0 | 1 {
  return lines.some((line) => line.level === 'fail') ? 1 : 0
}
