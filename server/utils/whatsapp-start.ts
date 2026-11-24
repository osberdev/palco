import { findWhatsappSend, finishWhatsappSend, startWhatsappSend } from '../data/whatsapp-sends'
import { findWhatsapp, type StoredWhatsapp } from '../db/whatsapp.repository'
import { findSessionUserById } from '../db/users.repository'
import type { Result } from '../domain/result'
import { evaluateSendStart } from '../domain/whatsapp-send'
import type { Purchase } from '../../types'
import {
  sendTicketsTemplate,
  uploadTicketsPdf,
  type MetaResponse,
  type TemplateMessage,
  type WhatsappConfig,
} from './whatsapp-client'
import { whatsappConfig } from './whatsapp-config'
import { whatsappDocumentName, whatsappTemplateParameters } from './whatsapp-message'
import { buildPurchasePdf } from './purchase-pdf'
import { launchTicketsSend, type SendLogLine } from './whatsapp-sender'

/**
 * What starting a send needs. Injected so it can be tested with a fake client;
 * `ticketsSendDeps()` builds the real one.
 */
export interface StartSendDeps {
  readonly config: WhatsappConfig | null
  readonly whatsapp: (userId: number) => Promise<StoredWhatsapp | null>
  /** The buyer's name from the database, never the payment holder or a request field. */
  readonly buyerName: (userId: number) => Promise<string | null>
  /** The purchase PDF, built once per send. */
  readonly pdf: (userId: number, folio: string) => Promise<Uint8Array>
  readonly upload: (config: WhatsappConfig, bytes: Uint8Array, filename: string) => Promise<MetaResponse>
  readonly send: (config: WhatsappConfig, to: string, mediaId: string, message: TemplateMessage) => Promise<MetaResponse>
  readonly now: () => number
  readonly sleep: (ms: number) => Promise<void>
  readonly log: (line: SendLogLine) => void
  readonly report: (folio: string, error: unknown) => void
}

export type StartSendResult =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'notRegistered' }
  | { readonly kind: 'inProgress' }
  | { readonly kind: 'limited'; readonly result: Result; readonly retryAfterSeconds: number }
  /** `done` resolves when the send ends and never rejects; only the tests await it. */
  | { readonly kind: 'started'; readonly done: Promise<void> }

/**
 * Decides and starts a purchase's send. Used by "Enviar a WhatsApp" and by the
 * automatic send on confirmation. The number comes from the profile, never from
 * the request (RN-ENV-01).
 *
 * It first reads the database, the number and the buyer: another request may
 * interleave, but these reads decide nothing, and a failure throws before the send
 * is counted, without leaving it stuck in `sending`. In `POST …/whatsapp` that is a
 * 500; in the purchase the 201 still goes out (RN-ENV-02). Then it decides on the
 * outbox, which lives in this process's memory, with no `await` until the send is
 * recorded: two simultaneous starts cannot both pass the RN-ENV-04 limit.
 */
export async function startTicketsSend(userId: number, purchase: Purchase, now: number, deps: StartSendDeps): Promise<StartSendResult> {
  const config = deps.config
  if (!config) return { kind: 'unavailable' }
  const stored = await deps.whatsapp(userId)
  if (!stored) return { kind: 'notRegistered' }
  const buyer = await deps.buyerName(userId)

  const folio = purchase.folio
  const current = findWhatsappSend(userId, folio)
  const decision = evaluateSendStart(current?.started ?? [], current?.state === 'sending', now)
  if (decision.kind === 'in-progress') return { kind: 'inProgress' }
  if (decision.kind === 'limited') {
    return { kind: 'limited', result: decision.result, retryAfterSeconds: decision.retryAfterSeconds }
  }

  startWhatsappSend(userId, folio, now, decision.kept)
  // The message is built here, once and before launching: if it is impossible, the
  // send ends without uploading the PDF, which carries the purchase's name, folio and
  // QR codes. It counts as started for RN-ENV-04, like any send that fails.
  const message = whatsappTemplateParameters(purchase, config.template, buyer ?? '')
  if (!message.ok) {
    finishWhatsappSend(userId, folio, {
      state: 'failed',
      failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: null, offline: false },
      at: deps.now(),
    })
    deps.report(folio, new Error(`${config.template}: ${message.reason}`))
    return { kind: 'started', done: Promise.resolve() }
  }
  const body = message.body
  const filename = whatsappDocumentName(purchase)
  const done = launchTicketsSend(
    { folio, to: stored.e164, filename, pdf: () => deps.pdf(userId, folio) },
    {
      upload: (bytes, name) => deps.upload(config, bytes, name),
      send: (to, mediaId) => deps.send(config, to, mediaId, { body, filename }),
      now: deps.now,
      sleep: deps.sleep,
      log: deps.log,
    },
    (result, at) => finishWhatsappSend(
      userId,
      folio,
      result.state === 'sent' ? { state: 'sent', wamid: result.wamid, at } : { state: 'failed', failure: result.failure, at },
    ),
    (error) => deps.report(folio, error),
  )
  return { kind: 'started', done }
}

// With a single argument: `findWhatsapp` also takes the default database.
const findWhatsappOfUser = async (userId: number) => await findWhatsapp(userId)

/** The real dependencies: the current configuration, the database and Meta. */
export function ticketsSendDeps(): StartSendDeps {
  return {
    config: whatsappConfig(),
    whatsapp: findWhatsappOfUser,
    buyerName: async (userId) => (await findSessionUserById(userId))?.displayName ?? null,
    pdf: async (userId, folio) => {
      const built = await buildPurchasePdf(userId, folio, new Date())
      if (!built.ok) throw new Error(`PDF de ${folio}: ${built.statusCode}`)
      return built.pdf
    },
    upload: uploadTicketsPdf,
    send: sendTicketsTemplate,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.info(JSON.stringify(line)),
    report: (folio, error) => console.error(JSON.stringify({
      event: 'whatsapp',
      folio,
      error: error instanceof Error ? error.message : 'desconocido',
    })),
  }
}
