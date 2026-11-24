import type { WhatsappSendFailure } from '../data/whatsapp-sends'
import {
  WHATSAPP_RETRY_DELAYS_MS,
  classifyMetaSend,
  classifyMetaUpload,
  type MetaFailure,
} from '../domain/whatsapp-send'
import type { MetaResponse } from './whatsapp-client'

/**
 * Sends the PDF with retries (RN-ENV-03). Each attempt uploads the PDF and sends
 * the template with that upload's id, never an earlier one. Transient failures are
 * retried at 2 and at 8 seconds; anything else ends the send. Client, clock, delay
 * and logger are injected.
 */
export interface SendJob {
  readonly folio: string
  /** The profile's E.164 number (RN-ENV-01); it is never logged. */
  readonly to: string
  readonly filename: string
  /** The PDF is built once per send, at the start. */
  readonly pdf: () => Promise<Uint8Array>
}

export interface SendLogLine {
  readonly event: 'whatsapp'
  readonly folio: string
  readonly attempt: number
  readonly step: 'upload' | 'send'
  readonly status: number
  readonly code: number | null
  readonly ms: number
  readonly wamid: string | null
}

export interface SendDeps {
  readonly upload: (bytes: Uint8Array, filename: string) => Promise<MetaResponse>
  readonly send: (to: string, mediaId: string) => Promise<MetaResponse>
  readonly now: () => number
  readonly sleep: (ms: number) => Promise<void>
  readonly log: (line: SendLogLine) => void
}

export type SendResult =
  | { readonly state: 'sent'; readonly wamid: string }
  | { readonly state: 'failed'; readonly failure: WhatsappSendFailure }

function toFailure(failure: MetaFailure): WhatsappSendFailure {
  return {
    code: failure.kind === 'unreachable' ? 'ERR_WHATSAPP_UNREACHABLE' : 'ERR_WHATSAPP_SEND_FAILED',
    metaCode: failure.metaCode,
    offline: failure.kind === 'transient' && failure.offline,
  }
}

export async function runTicketsSend(job: SendJob, deps: SendDeps): Promise<SendResult> {
  const pdf = await job.pdf()
  const attempts = WHATSAPP_RETRY_DELAYS_MS.length + 1
  let failure: MetaFailure = { kind: 'transient', metaCode: null, offline: true }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const uploadStart = deps.now()
    const uploadResponse = await deps.upload(pdf, job.filename)
    const upload = classifyMetaUpload(uploadResponse.status, uploadResponse.body)
    deps.log({
      event: 'whatsapp', folio: job.folio, attempt, step: 'upload', status: uploadResponse.status,
      code: upload.kind === 'uploaded' ? null : upload.metaCode, ms: deps.now() - uploadStart, wamid: null,
    })

    if (upload.kind === 'uploaded') {
      const sendStart = deps.now()
      const sendResponse = await deps.send(job.to, upload.mediaId)
      const sent = classifyMetaSend(sendResponse.status, sendResponse.body)
      deps.log({
        event: 'whatsapp', folio: job.folio, attempt, step: 'send', status: sendResponse.status,
        code: sent.kind === 'accepted' ? null : sent.metaCode, ms: deps.now() - sendStart,
        wamid: sent.kind === 'accepted' ? sent.wamid : null,
      })
      if (sent.kind === 'accepted') return { state: 'sent', wamid: sent.wamid }
      failure = sent
    }
    else {
      failure = upload
    }

    if (failure.kind !== 'transient') break
    const delay = WHATSAPP_RETRY_DELAYS_MS[attempt - 1]
    if (delay !== undefined) await deps.sleep(delay)
  }

  return { state: 'failed', failure: toFailure(failure) }
}

/**
 * Runs a send nobody waits for and leaves the result in the outbox. It never
 * rejects: an unexpected exception leaves the send `failed` with
 * `ERR_WHATSAPP_SEND_FAILED` and is logged, without bringing the process down.
 */
export async function launchTicketsSend(
  job: SendJob,
  deps: SendDeps,
  finish: (result: SendResult, at: number) => void,
  report: (error: unknown) => void,
): Promise<void> {
  let result: SendResult
  try {
    result = await runTicketsSend(job, deps)
  }
  catch (error) {
    report(error)
    result = { state: 'failed', failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: false } }
  }
  try {
    finish(result, deps.now())
  }
  catch (error) {
    report(error)
  }
}
