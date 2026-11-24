import { isFolio } from '../server/domain/confirmation'
import type { PurchaseStep } from '../types'

/**
 * What the UI does with the response of `POST /api/purchases`. Pure functions:
 * classifying the response and the request identifier of RN-CON-07.
 */

export type ConfirmationOutcome =
  | { readonly kind: 'confirmed'; readonly folio: string }
  | {
      readonly kind: 'rejected'
      readonly step: PurchaseStep
      readonly field: string
      readonly seatIndex: number | null
      readonly code: string
      readonly message: string
    }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed'; readonly status: number }

type Fields = Readonly<Record<string, unknown>>

function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStep(value: unknown): value is PurchaseStep {
  return value === 'tickets' || value === 'payment'
}

/**
 * Fixed order, the first one that applies wins. Only a rejection with the full
 * `PurchaseFailure` shape and a field points at a field: a 400 without `step`
 * (unreadable JSON, `requestId`) or with another shape, such as h3's "Invalid
 * JSON body", is a failure and blames no field.
 *
 * @param status HTTP status; 0 if there was no response.
 */
export function classifyPurchaseResponse(status: number, body: unknown): ConfirmationOutcome {
  if (status === 0) return { kind: 'offline' }
  if (status === 401) return { kind: 'unauthorized' }

  if ((status === 200 || status === 201) && isObject(body) && body.ok === true) {
    const { folio } = body
    if (typeof folio === 'string' && isFolio(folio)) return { kind: 'confirmed', folio }
  }

  if (status === 400 && isObject(body) && body.ok === false) {
    const { step, field, seatIndex, code, message } = body
    if (isStep(step) && typeof field === 'string' && field !== '' && typeof code === 'string' && typeof message === 'string') {
      return {
        kind: 'rejected',
        step,
        field,
        seatIndex: typeof seatIndex === 'number' && Number.isInteger(seatIndex) ? seatIndex : null,
        code,
        message,
      }
    }
  }

  return { kind: 'failed', status }
}

const REQUEST_ID_BYTES = 16

function uuidFromBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

/**
 * A UUID v4 from 16 bytes: sets the version (4) and variant (10) bits. Null if
 * there are not 16.
 */
export function formatRequestId(bytes: Uint8Array): string | null {
  if (bytes.length !== REQUEST_ID_BYTES) return null
  const copy = Uint8Array.from(bytes)
  copy[6] = (copy[6]! & 0x0f) | 0x40
  copy[8] = (copy[8]! & 0x3f) | 0x80
  return uuidFromBytes(copy)
}

/**
 * With `crypto.getRandomValues` rather than `crypto.randomUUID`, which only exists
 * in secure contexts: on `http://192.168.x.x` it would be `undefined`.
 */
export function generateRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REQUEST_ID_BYTES))
  return formatRequestId(bytes) ?? uuidFromBytes(bytes)
}

export interface RequestKey {
  readonly requestId: string
  /** The serialized purchase body; it lives only in the page's memory. */
  readonly fingerprint: string
}

/**
 * The identifier is kept across retries of the same purchase and renewed when the
 * body changes: then it is another purchase.
 */
export function nextRequestKey(previous: RequestKey | null, fingerprint: string, generate: () => string): RequestKey {
  if (previous !== null && previous.fingerprint === fingerprint) return previous
  return { requestId: generate(), fingerprint }
}
