import { evaluateRequestOrigin } from '../domain/request-origin'

/**
 * RN-SEG-03 over all of `/api/`, before the session and the registration limit: a
 * page on another site cannot use up the victim IP's limit, because its requests
 * are rejected before being counted. Pages and `/_nuxt` do not go through here.
 *
 * The server origin is the request's own, without `X-Forwarded-Host` or
 * `X-Forwarded-Proto`: there is no proxy in front, and a client would choose with a
 * header the origin it is compared against. With `nuxt dev --host`, `Origin` and
 * `Host` are the same network IP and the comparison still works.
 */
export default defineEventHandler((event) => {
  // Lowercased, as the router does with pages: `/API/…` does not reach any
  // endpoint, but closing it costs nothing.
  if (!event.path.toLowerCase().startsWith('/api/')) return

  const result = evaluateRequestOrigin({
    method: event.method,
    fetchSite: getRequestHeader(event, 'sec-fetch-site') ?? null,
    origin: getRequestHeader(event, 'origin') ?? null,
    serverOrigin: getRequestURL(event).origin,
  })
  if (result.ok) return

  setResponseStatus(event, 403)
  return { ok: false, code: result.code, message: result.message }
})
