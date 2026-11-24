import type { SavedPaymentMethod, SessionUser } from '../types'

/**
 * What the UI does with the response of an account endpoint (profile photo, saved
 * payment methods), in the style of `classifyPurchaseResponse`. Each caller
 * recognizes success by its shape; the rest is shared.
 */
export type AccountOutcome<T> =
  | { readonly kind: 'saved'; readonly value: T }
  | { readonly kind: 'rejected'; readonly field: string | null; readonly code: string; readonly message: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed'; readonly status: number }

type Fields = Readonly<Record<string, unknown>>

export function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fixed order, the first one that applies wins: no response → `offline`; 401 →
 * `unauthorized`; 200 or 201 with `ok: true` and the success shape → `saved`; 400
 * or 429 with `ok: false`, `code` and `message` → `rejected`; otherwise →
 * `failed`. The 429 is the registration limit (RN-REG-07), which has the shape of
 * the other rejections. A 400 or a 429 without the rejection shape (an h3 error)
 * is a failure: there is no message to show.
 *
 * @param status HTTP status; 0 if there was no response.
 * @param success Recognizes a success body and returns its value, or null.
 */
export function classifyAccountResponse<T>(status: number, body: unknown, success: (body: Fields) => T | null): AccountOutcome<T> {
  if (status === 0) return { kind: 'offline' }
  if (status === 401) return { kind: 'unauthorized' }

  if ((status === 200 || status === 201) && isObject(body) && body.ok === true) {
    const value = success(body)
    if (value !== null) return { kind: 'saved', value }
  }

  if ((status === 400 || status === 429) && isObject(body) && body.ok === false) {
    const { field, code, message } = body
    if (typeof code === 'string' && code !== '' && typeof message === 'string' && message !== '') {
      return { kind: 'rejected', field: typeof field === 'string' && field !== '' ? field : null, code, message }
    }
  }

  return { kind: 'failed', status }
}

export function isSessionUser(value: unknown): value is SessionUser {
  return isObject(value)
    && typeof value.id === 'number'
    && typeof value.username === 'string'
    && typeof value.displayName === 'string'
    && (value.photoVersion === null || typeof value.photoVersion === 'string')
}

export function isSavedPaymentMethod(value: unknown): value is SavedPaymentMethod {
  if (!isObject(value) || typeof value.id !== 'string') return false
  if (value.method === 'paypal') return typeof value.email === 'string'
  return (value.method === 'debit' || value.method === 'credit')
    && (value.brand === 'visa' || value.brand === 'mastercard')
    && typeof value.last4 === 'string'
    && typeof value.holder === 'string'
    && typeof value.expiry === 'string'
}

/** Success of `POST` and `PATCH /api/payment-methods`: the saved method. */
export const savedMethodSuccess = (body: Fields): SavedPaymentMethod | null =>
  (isSavedPaymentMethod(body.method) ? body.method : null)

/** Success of `DELETE /api/payment-methods/:id`: `{ ok: true }`, nothing more. */
export const deletedSuccess = (): true => true
