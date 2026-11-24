import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createError } from 'h3'
import { createFetchError } from 'ofetch'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_TIMEOUT_MS,
  failureTrace,
  fetchFailureMessage,
  fetchFailureStatus,
  isTimeoutError,
  isTimeoutFailure,
} from '../utils/http'

describe('fetchFailureStatus', () => {
  it('FetchError sin response (red caída) → 0', () => {
    const failure = createFetchError({
      request: '/api/catalog',
      options: { headers: new Headers() },
      error: new TypeError('Failed to fetch'),
    })
    expect(failure.response).toBeUndefined()
    expect(fetchFailureStatus(failure)).toBe(0)
  })

  it('FetchError con response 504 → 504', () => {
    const failure = createFetchError({
      request: '/api/catalog',
      options: { headers: new Headers() },
      response: new Response(null, { status: 504, statusText: 'Gateway Timeout' }),
    })
    expect(fetchFailureStatus(failure)).toBe(504)
  })
})

describe('fetchFailureMessage', () => {
  it('respuesta con message de cadena → el mensaje', () => {
    const failure = { response: { status: 404, _data: { statusCode: 404, message: 'Recinto inexistente' } } }
    expect(fetchFailureMessage(failure)).toBe('Recinto inexistente')
  })

  it('sin respuesta (red caída) → null', () => {
    const failure = createFetchError({
      request: '/api/venues/teatro-scala',
      options: { headers: new Headers() },
      error: new TypeError('Failed to fetch'),
    })
    expect(fetchFailureMessage(failure)).toBeNull()
  })

  it('message que no es cadena → null', () => {
    const failure = { response: { status: 404, _data: { message: 404 } } }
    expect(fetchFailureMessage(failure)).toBeNull()
  })

  it('message vacío → null', () => {
    const failure = { response: { status: 404, _data: { message: '' } } }
    expect(fetchFailureMessage(failure)).toBeNull()
  })
})

describe('tiempo límite del catálogo', () => {
  const timeoutError = new DOMException('signal timed out', 'TimeoutError')

  it('TO1: abortado por AbortSignal.timeout, sin respuesta → tiempo agotado', () => {
    expect(isTimeoutFailure({ error: timeoutError })).toBe(true)
  })

  it('TO2: red caída (TypeError) → no es tiempo agotado', () => {
    expect(isTimeoutFailure({ error: new TypeError('Failed to fetch') })).toBe(false)
  })

  it('TO3: con respuesta → no es tiempo agotado, aunque el error se llame igual', () => {
    expect(isTimeoutFailure({ response: { status: 504 }, error: timeoutError })).toBe(false)
  })

  it('TO4: sin error ni respuesta → no es tiempo agotado', () => {
    expect(isTimeoutFailure({})).toBe(false)
    expect(isTimeoutFailure({ error: null })).toBe(false)
  })

  it('TO5: la traza distingue el motivo', () => {
    expect(failureTrace(0, true)).toBe('tiempo agotado')
    expect(failureTrace(0, false)).toBe('sin conexión')
    expect(failureTrace(500, false)).toBe('error 500')
  })

  it('TO6: el inicio y el catálogo piden /api/catalog con CATALOG_TIMEOUT_MS', () => {
    expect(CATALOG_TIMEOUT_MS).toBe(5000)
    for (const page of ['pages/index.vue', 'pages/catalogo/[categoria].vue']) {
      const source = readFileSync(resolve(page), 'utf8')
      const call = /useFetch<CatalogResponse>\('\/api\/catalog', \{([\s\S]*?)\n\}\)/.exec(source)
      expect(call, page).not.toBeNull()
      expect(call?.[1], page).toMatch(/^\s*timeout: CATALOG_TIMEOUT_MS,$/m)
    }
  })
})

describe('el motivo se decide una vez, con el error de useFetch', () => {
  it('TO7: el TimeoutError envuelto por createError, como lo deja useAsyncData → tiempo agotado', () => {
    const error = createError(new DOMException('signal timed out', 'TimeoutError'))
    expect(isTimeoutError(error)).toBe(true)
    expect(isTimeoutError(new DOMException('signal timed out', 'TimeoutError'))).toBe(true)
  })

  it('TO8: la red caída envuelta por createError no es tiempo agotado; la traza no cambia de motivo', () => {
    const network = createError(
      createFetchError({ request: '/api/catalog', options: { headers: new Headers() }, error: new TypeError('Failed to fetch') }),
    )
    expect(isTimeoutError(network)).toBe(false)
    expect(isTimeoutError(null)).toBe(false)
    expect(isTimeoutError(undefined)).toBe(false)
    // With a timeout error, the first trace is already the final one.
    const timeout = createError(new DOMException('signal timed out', 'TimeoutError'))
    expect(failureTrace(0, isTimeoutError(timeout))).toBe('tiempo agotado')
    expect(failureTrace(0, isTimeoutError(network))).toBe('sin conexión')
  })
})
