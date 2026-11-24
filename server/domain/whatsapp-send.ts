import { evaluateRateLimit, type RateLimitPolicy } from './rate-limit'
import { err, type Result } from './result'

/**
 * Sending the PDF through the WhatsApp Business platform (RN-ENV-03 and 04). It
 * classifies Meta's responses and decides whether a send may start; it knows
 * nothing about HTTP or clocks: it receives the status, the already read body and
 * the instant.
 */

/** Errors that are retried. */
export const WHATSAPP_TRANSIENT_CODES: readonly number[] = [1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131056, 133004]

/** The number cannot receive PALCO messages yet. */
export const WHATSAPP_UNREACHABLE_CODE = 131030

/** RN-ENV-03: at most three attempts, at 2 and at 8 seconds. */
export const WHATSAPP_RETRY_DELAYS_MS: readonly number[] = [2000, 8000]

/** RN-ENV-04: three sends per purchase per hour, in a sliding window. */
export const WHATSAPP_SEND_LIMIT: RateLimitPolicy = { limit: 3, windowMs: 3_600_000 }

export type MetaFailure =
  | { readonly kind: 'unreachable'; readonly metaCode: number }
  | { readonly kind: 'transient'; readonly metaCode: number | null; readonly offline: boolean }
  | { readonly kind: 'permanent'; readonly metaCode: number | null }

export type MetaUploadOutcome = { readonly kind: 'uploaded'; readonly mediaId: string } | MetaFailure
export type MetaSendOutcome = { readonly kind: 'accepted'; readonly wamid: string } | MetaFailure

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSuccess = (status: number): boolean => status >= 200 && status < 300

/** `body.error.code`, only if it is an integer. */
function metaCode(body: unknown): number | null {
  if (!isFields(body) || !isFields(body.error)) return null
  const { code } = body.error
  return typeof code === 'number' && Number.isInteger(code) ? code : null
}

/**
 * Whatever was not a success: no response or a service error is transient; 131030
 * is unreachable; any other code is permanent. A 2xx without the expected content
 * also ends up here, as permanent without a code.
 */
function classifyFailure(status: number, body: unknown): MetaFailure {
  if (status === 0) return { kind: 'transient', metaCode: null, offline: true }
  const code = metaCode(body)
  if (code === WHATSAPP_UNREACHABLE_CODE) return { kind: 'unreachable', metaCode: code }
  if (status >= 500 || (code !== null && WHATSAPP_TRANSIENT_CODES.includes(code))) {
    return { kind: 'transient', metaCode: code, offline: false }
  }
  return { kind: 'permanent', metaCode: code }
}

/** The PDF upload: 2xx with a text `id`, or the failure. */
export function classifyMetaUpload(status: number, body: unknown): MetaUploadOutcome {
  if (isSuccess(status) && isFields(body) && typeof body.id === 'string') return { kind: 'uploaded', mediaId: body.id }
  return classifyFailure(status, body)
}

/** The template send: 2xx with a text `messages[0].id`, or the failure. */
export function classifyMetaSend(status: number, body: unknown): MetaSendOutcome {
  if (isSuccess(status) && isFields(body) && Array.isArray(body.messages)) {
    const [first] = body.messages as unknown[]
    if (isFields(first) && typeof first.id === 'string') return { kind: 'accepted', wamid: first.id }
  }
  return classifyFailure(status, body)
}

export type SendStart =
  | { readonly kind: 'in-progress' }
  | { readonly kind: 'limited'; readonly result: Result; readonly retryAfterSeconds: number }
  | { readonly kind: 'start'; readonly kept: readonly number[] }

/**
 * Whether a send of the purchase may start (RN-ENV-04). One in progress neither
 * starts another nor counts. Every started send counts, even if it fails; retries
 * of the same send do not add up.
 */
export function evaluateSendStart(started: readonly number[], sending: boolean, now: number): SendStart {
  if (sending) return { kind: 'in-progress' }
  const decision = evaluateRateLimit(started, now, WHATSAPP_SEND_LIMIT)
  if (decision.ok) return { kind: 'start', kept: decision.kept }
  const result = decision.result.code === 'ERR_REGISTRATION_RATE_LIMITED' ? err('ERR_WHATSAPP_SEND_LIMIT') : decision.result
  return { kind: 'limited', result, retryAfterSeconds: Math.ceil(decision.retryAfterMs / 1000) }
}

/** What is left of the three sends in the window. */
export function remainingSends(started: readonly number[], now: number): number {
  const inWindow = started.filter((instant) => now - instant < WHATSAPP_SEND_LIMIT.windowMs).length
  return Math.max(0, WHATSAPP_SEND_LIMIT.limit - inWindow)
}
