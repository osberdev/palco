/**
 * Client for the WhatsApp Business platform. The only place that calls Meta. It
 * never throws: without a response, `status` is 0. The token only goes in
 * `Authorization`, and neither it nor the number is written to any log.
 */
export interface WhatsappConfig {
  readonly accessToken: string
  readonly phoneNumberId: string
  readonly template: string
  readonly language: string
  /** `https://graph.facebook.com`, or a local server that imitates Meta. */
  readonly apiBase: string
  readonly apiVersion: string
}

export interface MetaResponse {
  readonly status: number
  readonly body: unknown
}

export interface TemplateMessage {
  /** The body texts of the configured template, in the approved order. */
  readonly body: readonly string[]
  /** The document name in the chat. */
  readonly filename: string
}

const TIMEOUT_MS = 10_000

function endpoint(config: WhatsappConfig, resource: 'media' | 'messages'): string {
  return `${config.apiBase}/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/${resource}`
}

async function call(url: string, init: RequestInit): Promise<MetaResponse> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  }
  catch {
    return { status: 0, body: null }
  }
  // A body that is not JSON (a proxy's 502) is still a response.
  let body: unknown = null
  try {
    body = await response.json()
  }
  catch {
    body = null
  }
  return { status: response.status, body }
}

/** Uploads the PDF and returns its id; every send uploads its own. */
export function uploadTicketsPdf(config: WhatsappConfig, bytes: Uint8Array, filename: string): Promise<MetaResponse> {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'application/pdf')
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), filename)
  return call(endpoint(config, 'media'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
  })
}

/** Sends the template with the document from that upload and the body texts. */
export function sendTicketsTemplate(
  config: WhatsappConfig,
  to: string,
  mediaId: string,
  message: TemplateMessage,
): Promise<MetaResponse> {
  return call(endpoint(config, 'messages'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: config.template,
        language: { code: config.language },
        components: [
          { type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename: message.filename } }] },
          { type: 'body', parameters: message.body.map((text) => ({ type: 'text', text })) },
        ],
      },
    }),
  })
}
