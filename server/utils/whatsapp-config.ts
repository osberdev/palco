import type { WhatsappConfig } from './whatsapp-client'
import { isTicketTemplateName } from './whatsapp-templates.ts'

/**
 * The WhatsApp send configuration. The five required variables have no default:
 * without any of them, sending is unavailable (RF-ENV-09). They are read from
 * `process.env` as text, not from `runtimeConfig`: Nuxt passes the `NUXT_*`
 * variables through `destr`, which turns a 16-digit id into a number and can lose
 * precision.
 */
export const WHATSAPP_REQUIRED_VARIABLES = [
  'NUXT_WHATSAPP_ACCESS_TOKEN',
  'NUXT_WHATSAPP_PHONE_NUMBER_ID',
  'NUXT_WHATSAPP_BUSINESS_ACCOUNT_ID',
  'NUXT_WHATSAPP_TICKET_TEMPLATE',
  'NUXT_WHATSAPP_TEMPLATE_LANGUAGE',
] as const

export const WHATSAPP_API_BASE_DEFAULT = 'https://graph.facebook.com'
/** The latest Graph API version at implementation time. */
export const WHATSAPP_API_VERSION_DEFAULT = 'v26.0'

export type WhatsappConfigParse =
  | { readonly ok: true; readonly config: WhatsappConfig }
  | { readonly ok: false; readonly missing: readonly string[]; readonly invalid: readonly string[] }

/**
 * `https://…`, or `http://` only towards the local machine, for the server that
 * imitates Meta when exercising failures. Never a remote `http://`: the token would
 * travel in plain text.
 */
export function isWhatsappApiBase(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    return false
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return false
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
}

export function parseWhatsappConfig(env: Readonly<Record<string, string | undefined>>): WhatsappConfigParse {
  const value = (name: string): string => (env[name] ?? '').trim()
  const missing = WHATSAPP_REQUIRED_VARIABLES.filter((name) => value(name) === '')
  const apiBase = value('NUXT_WHATSAPP_API_BASE') || WHATSAPP_API_BASE_DEFAULT
  const apiVersion = value('NUXT_WHATSAPP_API_VERSION') || WHATSAPP_API_VERSION_DEFAULT
  const template = value('NUXT_WHATSAPP_TICKET_TEMPLATE')
  const invalid = [
    ...(template && !isTicketTemplateName(template) ? ['NUXT_WHATSAPP_TICKET_TEMPLATE'] : []),
    ...(isWhatsappApiBase(apiBase) ? [] : ['NUXT_WHATSAPP_API_BASE']),
    ...(/^v[0-9]+\.[0-9]+$/.test(apiVersion) ? [] : ['NUXT_WHATSAPP_API_VERSION']),
  ]
  if (missing.length > 0 || invalid.length > 0) return { ok: false, missing, invalid }
  return {
    ok: true,
    config: {
      accessToken: value('NUXT_WHATSAPP_ACCESS_TOKEN'),
      phoneNumberId: value('NUXT_WHATSAPP_PHONE_NUMBER_ID'),
      template,
      language: value('NUXT_WHATSAPP_TEMPLATE_LANGUAGE'),
      apiBase: apiBase.replace(/\/+$/, ''),
      apiVersion,
    },
  }
}

let current: WhatsappConfig | null = null

/** The current configuration, or null if sending is unavailable. */
export function whatsappConfig(): WhatsappConfig | null {
  return current
}

export function setWhatsappConfig(config: WhatsappConfig | null): void {
  current = config
}
