import { describe, expect, it } from 'vitest'
import { evaluateRequestOrigin, type RequestOriginInput } from '../server/domain/request-origin'

// Origin of state-changing requests (RN-SEG-03). Each case carries its identifier
// in its name.

const SERVER = 'http://localhost:3000'
const EVIL = 'https://evil.example'

const code = (input: Partial<RequestOriginInput> & { method: string }): string =>
  evaluateRequestOrigin({ fetchSite: null, origin: null, serverOrigin: SERVER, ...input }).code

describe('evaluateRequestOrigin — OR1–OR14', () => {
  it('OR1 fila 1: GET de otro sitio', () => {
    expect(code({ method: 'GET', fetchSite: 'cross-site', origin: EVIL })).toBe('OK')
  })

  it.each(['HEAD', 'OPTIONS'])('OR2 fila 1: %s de otro sitio', (method) => {
    expect(code({ method, fetchSite: 'cross-site', origin: EVIL })).toBe('OK')
  })

  it('OR3 fila 2: same-origin, sin Origin', () => {
    expect(code({ method: 'POST', fetchSite: 'same-origin' })).toBe('OK')
  })

  it('OR4 fila 2: none', () => {
    expect(code({ method: 'POST', fetchSite: 'none' })).toBe('OK')
  })

  // PROPFIND: an unknown method is not safe and follows rows 2–7.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND'])('OR5 fila 3: %s cross-site', (method) => {
    expect(code({ method, fetchSite: 'cross-site', origin: EVIL })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })

  it('OR6 fila 3: same-site, otro puerto del mismo localhost', () => {
    expect(code({ method: 'POST', fetchSite: 'same-site', origin: 'http://localhost:5173' })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })

  it.each(['Same-Origin', '', 'cross-origin'])('OR7 fila 4: Sec-Fetch-Site %j', (fetchSite) => {
    expect(code({ method: 'POST', fetchSite })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })

  it('OR8 fila 5: sin Sec-Fetch-Site, Origin igual al servidor', () => {
    expect(code({ method: 'POST', origin: SERVER })).toBe('OK')
  })

  it('OR9 fila 6: puerto distinto', () => {
    expect(code({ method: 'POST', origin: 'http://localhost:5173' })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })

  it('OR10 fila 6: esquema distinto', () => {
    expect(code({ method: 'POST', origin: 'https://localhost:3000' })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })

  it.each(['null', '', 'localhost:3000'])('OR11 fila 6: Origin %j', (origin) => {
    expect(code({ method: 'POST', origin })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })

  it('OR12 fila 7: sin ninguna de las dos cabeceras', () => {
    expect(code({ method: 'POST' })).toBe('OK')
  })

  it('OR13 Sec-Fetch-Site manda sobre Origin', () => {
    expect(code({ method: 'POST', fetchSite: 'cross-site', origin: SERVER })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })

  it('OR14 el método se compara en mayúsculas', () => {
    expect(code({ method: 'post', fetchSite: 'cross-site' })).toBe('ERR_CROSS_ORIGIN_REQUEST')
  })
})

describe('INV25 — un método seguro nunca se rechaza', () => {
  it('GET, HEAD y OPTIONS × Sec-Fetch-Site × Origin', () => {
    const fetchSites = ['same-origin', 'none', 'same-site', 'cross-site', 'Same-Origin', '', 'cross-origin', null]
    const origins = [SERVER, 'http://localhost:5173', 'https://localhost:3000', 'null', '', 'localhost:3000', null]
    let checked = 0
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      for (const fetchSite of fetchSites) {
        for (const origin of origins) {
          expect(code({ method, fetchSite, origin }), `${method} ${fetchSite} ${origin}`).toBe('OK')
          checked++
        }
      }
    }
    expect(checked).toBe(3 * 8 * 7)
  })
})
