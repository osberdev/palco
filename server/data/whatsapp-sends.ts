import type { ResultCode } from '../domain/result'

/**
 * The WhatsApp send outbox: per user and folio, in memory. "Enviar a WhatsApp" and
 * the automatic send both use it. `started` holds the instants of the started
 * sends, for RN-ENV-04. It never stores the number.
 */
export type WhatsappSendState = 'sending' | 'sent' | 'failed'

export interface WhatsappSendFailure {
  readonly code: ResultCode
  /** Meta's error code, or null if there was no response or it had none. */
  readonly metaCode: number | null
  readonly offline: boolean
}

export interface WhatsappSendRecord {
  readonly state: WhatsappSendState
  readonly startedAt: number
  readonly finishedAt: number | null
  readonly wamid: string | null
  readonly failure: WhatsappSendFailure | null
  readonly started: readonly number[]
}

export type WhatsappSendFinish =
  | { readonly state: 'sent'; readonly wamid: string; readonly at: number }
  | { readonly state: 'failed'; readonly failure: WhatsappSendFailure; readonly at: number }

const sends = new Map<string, WhatsappSendRecord>()

const key = (userId: number, folio: string): string => `${userId}:${folio}`

export function findWhatsappSend(userId: number, folio: string): WhatsappSendRecord | null {
  return sends.get(key(userId, folio)) ?? null
}

/** Starts a send: `kept` are the started sends still inside the window. */
export function startWhatsappSend(userId: number, folio: string, now: number, kept: readonly number[]): WhatsappSendRecord {
  const record: WhatsappSendRecord = {
    state: 'sending',
    startedAt: now,
    finishedAt: null,
    wamid: null,
    failure: null,
    started: [...kept, now],
  }
  sends.set(key(userId, folio), record)
  return record
}

export function finishWhatsappSend(userId: number, folio: string, finish: WhatsappSendFinish): void {
  const current = sends.get(key(userId, folio))
  if (!current) return
  sends.set(key(userId, folio), {
    ...current,
    state: finish.state,
    finishedAt: finish.at,
    wamid: finish.state === 'sent' ? finish.wamid : null,
    failure: finish.state === 'failed' ? finish.failure : null,
  })
}

/** Reset together with the purchases (RNF-18). */
export function resetWhatsappSends(): void {
  sends.clear()
}
