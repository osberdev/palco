/**
 * Timeout of `GET /api/catalog` on the home page and the catalog. Without it, a
 * slow server leaves the user waiting forever.
 */
export const CATALOG_TIMEOUT_MS = 5000

/** The only thing the classification reads from a `FetchError` or from its hooks' context. */
interface FetchFailure {
  readonly response?: { readonly status: number; readonly _data?: unknown }
  readonly error?: { readonly name?: string } | null
}

/**
 * HTTP status of a failed request; 0 if there was no response (network down),
 * which is what `fetch` and `XMLHttpRequest` report in that case.
 *
 * It is decided by the presence of `response` rather than by `statusCode`, and it
 * takes ofetch's `FetchError` or the `onRequestError`/`onResponseError` context,
 * not `useFetch`'s error. When converting it, h3's `createError` stores the
 * `FetchError`'s cause (the network `TypeError`) as `cause` instead of the
 * `FetchError` itself, loses `response` and fills in 500: the network failure
 * reached the screen as "error 500".
 */
export function fetchFailureStatus(failure: FetchFailure): number {
  return failure.response?.status ?? 0
}

/**
 * Whether the request was aborted by the timeout. `AbortSignal.timeout`, which
 * `useFetch` uses for its `timeout` option, aborts with a `DOMException` named
 * `TimeoutError`; with a response it is not a timeout, even if it is slow.
 */
export function isTimeoutFailure(failure: FetchFailure): boolean {
  return failure.response === undefined && failure.error?.name === 'TimeoutError'
}

/**
 * Whether `useFetch`'s `error` is a timeout. When its `timeout` expires,
 * `useAsyncData` rejects with the `TimeoutError` of `AbortSignal.timeout`, and
 * `createError` stores it as `cause`. It is decided from the error itself, at the
 * same moment as the failure time, rather than in `onRequestError`, which arrives
 * later: in between, the trace said "sin conexión".
 */
export function isTimeoutError(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 3 && typeof current === 'object' && current !== null; depth++) {
    if ('name' in current && current.name === 'TimeoutError') return true
    current = 'cause' in current ? current.cause : null
  }
  return false
}

/**
 * The `ErrorState` trace: a timeout is not "sin conexión", and without a response
 * there is no status to show, because "error 0" would say nothing.
 */
export function failureTrace(status: number, timedOut: boolean): string {
  if (timedOut) return 'tiempo agotado'
  return status === 0 ? 'sin conexión' : `error ${status}`
}

/**
 * The message from h3's error body (`createError({ message })`), or null if there
 * was no response or the body has no usable message. `_data` is the body as parsed
 * by ofetch and its shape is not guaranteed: it is narrowed.
 */
export function fetchFailureMessage(failure: FetchFailure): string | null {
  const body = failure.response?._data
  if (typeof body !== 'object' || body === null || !('message' in body)) return null
  const { message } = body
  return typeof message === 'string' && message !== '' ? message : null
}

/** HH:MM:SS in local time, 24-hour. */
export function formatClockTime(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}
