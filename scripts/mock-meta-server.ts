import { createServer, type IncomingMessage, type Server } from 'node:http'

/**
 * The simulated Meta logic, in an importable module: `scripts/mock-meta.mjs` starts
 * it from the terminal, and the integration tests (INT9) start it on a free port.
 * The application neither imports it nor has a "fake mode".
 *
 * It only imitates what `server/utils/whatsapp-client.ts` uses: POST
 * /{version}/{id}/media and POST /{version}/{id}/messages. It requires an
 * `Authorization: Bearer …` header without validating the token.
 */

export const MOCK_META_SCENARIOS = {
  'ok': 'acepta la subida y el envío',
  'unreachable': 'el envío responde 400 con el código 131030: el número no puede recibir mensajes de PALCO',
  'permanent': 'el envío responde 404 con el código 132001: la plantilla no existe',
  'transient-then-ok': 'los dos primeros envíos responden 500 con el código 1; desde el tercero, aceptado',
  'slow': 'acepta el envío después de 4 segundos',
} as const

export type MockMetaScenario = keyof typeof MOCK_META_SCENARIOS

export function isMockMetaScenario(value: string): value is MockMetaScenario {
  return Object.hasOwn(MOCK_META_SCENARIOS, value)
}

/** What is logged about a request: never the token, the number or the PDF. */
export interface MockMetaRequest {
  readonly method: string
  /** The path with the sender number id as `{phone-number-id}`. */
  readonly path: string
  readonly resource: 'media' | 'messages' | null
  readonly status: number
  readonly code: number | null
  readonly ms: number
  /** The id an upload returned, or the `wamid` of an accepted send. */
  readonly id: string | null
}

export interface MockMetaOptions {
  readonly scenario: MockMetaScenario
  /**
   * Called with every answered request. `body` is the received body and is only
   * collected if someone asks for it: the tests read it in memory to check what Meta
   * received; the terminal never writes it.
   */
  readonly onRequest?: (entry: MockMetaRequest, body: Buffer) => void
  readonly keepBodies?: boolean
  /** Prefix of each upload id; different per server, so they do not repeat across scenarios. */
  readonly mediaIdPrefix?: string
  /** Holds every send until it resolves: a test keeps a send in progress without depending on time. */
  readonly holdMessages?: () => Promise<void>
}

const SLOW_MS = 4000
const ROUTE = /^\/v\d+\.\d+\/[^/]+\/(media|messages)$/

/** The path without the sender number id, which is deployment configuration. */
export function redactedPath(path: string): string {
  return path.replace(/^(\/v\d+\.\d+\/)[^/]+\//, '$1{phone-number-id}/')
}

/** The terminal line: time, method, path, status, code and duration. */
export function formatRequestLine(entry: MockMetaRequest, at: Date): string {
  return `${at.toISOString()} ${entry.method} ${entry.path} → ${entry.status}${entry.code ? ` (código ${entry.code})` : ''} · ${entry.ms} ms`
}

interface MetaErrorBody { readonly error: { readonly message: string, readonly type: string, readonly code: number, readonly fbtrace_id: string } }
type Reply = readonly [number, Record<string, unknown> | MetaErrorBody]

function metaError(code: number, message: string): MetaErrorBody {
  return { error: { message, type: 'OAuthException', code, fbtrace_id: 'mock' } }
}

export function createMockMetaServer(options: MockMetaOptions): Server {
  const { scenario } = options
  let sends = 0
  let uploads = 0

  /** A template send's status and body according to the scenario. */
  function sendResult(): Reply {
    sends += 1
    const accepted: Reply = [200, { messaging_product: 'whatsapp', contacts: [{ input: 'mock' }], messages: [{ id: `wamid.mock-${sends}` }] }]
    switch (scenario) {
      case 'unreachable':
        return [400, metaError(131030, 'Recipient phone number not in allowed list')]
      case 'permanent':
        return [404, metaError(132001, 'Template name does not exist in the translation')]
      case 'transient-then-ok':
        return sends <= 2 ? [500, metaError(1, 'An unknown error has occurred.')] : accepted
      default:
        return accepted
    }
  }

  async function respond(request: IncomingMessage, resource: 'media' | 'messages' | null): Promise<Reply> {
    if (resource === null) return [404, metaError(100, 'Unsupported request')]
    if (!/^Bearer \S+$/.test(request.headers.authorization ?? '')) return [401, metaError(190, 'Invalid OAuth access token')]
    if (resource === 'media') {
      uploads += 1
      return [200, { id: `${options.mediaIdPrefix ?? 'media-mock-'}${uploads}` }]
    }
    if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, SLOW_MS))
    await options.holdMessages?.()
    return sendResult()
  }

  return createServer((request, response) => {
    // Monotonic clock: the wall clock can jump (on WSL, by seconds within a run).
    const started = performance.now()
    const keep = options.keepBodies === true
    const chunks: Buffer[] = []
    // Without anyone asking for it, the body is consumed and discarded.
    request.on('data', (chunk: Buffer) => {
      if (keep) chunks.push(chunk)
    })
    const answer = async (): Promise<void> => {
      const match = request.method === 'POST' ? ROUTE.exec(request.url ?? '') : null
      const resource = match ? match[1] as 'media' | 'messages' : null
      const [status, body] = await respond(request, resource)
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
      const error = (body as Partial<MetaErrorBody>).error
      const accepted = body as { id?: string, messages?: { id: string }[] }
      options.onRequest?.({
        method: request.method ?? '',
        path: redactedPath(request.url ?? ''),
        resource,
        status,
        code: error?.code ?? null,
        ms: Math.round(performance.now() - started),
        id: accepted.id ?? accepted.messages?.[0]?.id ?? null,
      }, Buffer.concat(chunks))
    }
    request.on('end', () => {
      void answer()
    })
  })
}
