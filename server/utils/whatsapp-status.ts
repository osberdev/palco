import { findWhatsappSend } from '../data/whatsapp-sends'
import { findWhatsapp } from '../db/whatsapp.repository'
import { evaluateSendStart, remainingSends } from '../domain/whatsapp-send'
import { maskWhatsapp } from '../domain/whatsapp'
import type { WhatsappSendStatus } from '../../types'
import { whatsappConfig } from './whatsapp-config'

/** A purchase's send status for its owner: never the E.164 number. */
export async function whatsappSendStatus(userId: number, folio: string, now: number): Promise<WhatsappSendStatus> {
  const stored = await findWhatsapp(userId)
  const masked = stored ? maskWhatsapp(stored.e164) : null
  const record = findWhatsappSend(userId, folio)
  const started = record?.started ?? []
  const remaining = remainingSends(started, now)
  const wait = remaining === 0 ? evaluateSendStart(started, false, now) : null
  const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString())

  return {
    available: whatsappConfig() !== null,
    registered: stored !== null,
    masked: masked?.ok ? masked.value : null,
    state: record?.state ?? 'idle',
    failure: record?.failure
      ? { ...record.failure, at: iso(record.finishedAt) ?? new Date(now).toISOString() }
      : null,
    sentAt: record?.state === 'sent' ? iso(record.finishedAt) : null,
    remaining,
    retryAfterSeconds: wait?.kind === 'limited' ? wait.retryAfterSeconds : null,
  }
}
