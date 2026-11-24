import { err, ok, type Result } from './result'

/**
 * Origin of state-changing requests (RN-SEG-03). The `SameSite=Lax` cookie is not
 * enough: it does not stop another site from creating a session with a `<form>`
 * (login CSRF), and two `localhost` ports are the same site, so the cookie does
 * travel between them.
 */
export interface RequestOriginInput {
  readonly method: string
  /** The `Sec-Fetch-Site` header, or null if missing. */
  readonly fetchSite: string | null
  /** The `Origin` header, or null if missing. */
  readonly origin: string | null
  /** `protocol://host` of the request itself. */
  readonly serverOrigin: string
}

/** Queries never change data (RN-SEG-03). */
const SAFE_METHODS: readonly string[] = ['GET', 'HEAD', 'OPTIONS']
const TRUSTED_FETCH_SITES: readonly string[] = ['same-origin', 'none']

/**
 * Decision table, the first row that applies wins: safe method; trusted
 * `Sec-Fetch-Site`; any other `Sec-Fetch-Site`, known (`same-site`, `cross-site`)
 * or not, is rejected; without it, an `Origin` equal to the server's; a different
 * or malformed `Origin`, or the text `null`, is rejected; with neither header the
 * request does not come from a browser, the only client holding the victim's
 * cookie, and it passes.
 *
 * Headers are compared as is: the browser writes them in lowercase without
 * spaces, and anything that does not match exactly is another value. The method
 * is compared in uppercase, without trimming; an unknown one is not safe.
 */
export function evaluateRequestOrigin(input: RequestOriginInput): Result {
  if (SAFE_METHODS.includes(input.method.toUpperCase())) return ok()

  if (input.fetchSite !== null) {
    return TRUSTED_FETCH_SITES.includes(input.fetchSite) ? ok() : err('ERR_CROSS_ORIGIN_REQUEST')
  }
  if (input.origin !== null) {
    return input.origin === input.serverOrigin ? ok() : err('ERR_CROSS_ORIGIN_REQUEST')
  }
  return ok()
}
