import { beforeEach, describe, expect, it } from 'vitest'
import { findWhatsappSend, finishWhatsappSend, resetWhatsappSends, startWhatsappSend } from '../server/data/whatsapp-sends'
import { evaluateSendStart, remainingSends } from '../server/domain/whatsapp-send'

// The send limit and the outbox (RN-ENV-04). Each case carries its identifier in its name.

const T = 10_000_000
const FOLIO = 'PLC-0001-2026'

/** What the endpoint would do: decide with the outbox and, if allowed, start. */
function post(now: number) {
  const current = findWhatsappSend(1, FOLIO)
  const decision = evaluateSendStart(current?.started ?? [], current?.state === 'sending', now)
  if (decision.kind === 'start') startWhatsappSend(1, FOLIO, now, decision.kept)
  return decision
}

beforeEach(() => {
  resetWhatsappSends()
})

describe('límite y bandeja', () => {
  it('WE19: el cuarto envío iniciado en una hora se rechaza con su espera', () => {
    for (const offset of [0, 60_000, 120_000]) {
      expect(post(T + offset).kind).toBe('start')
      finishWhatsappSend(1, FOLIO, { state: 'failed', failure: { code: 'ERR_WHATSAPP_SEND_FAILED', metaCode: 1, offline: false }, at: T + offset + 1 })
    }
    expect(remainingSends(findWhatsappSend(1, FOLIO)!.started, T + 180_000)).toBe(0)
    const fourth = post(T + 180_000)
    expect(fourth).toMatchObject({ kind: 'limited', retryAfterSeconds: 3420 })
    if (fourth.kind === 'limited') expect(fourth.result.code).toBe('ERR_WHATSAPP_SEND_LIMIT')
    expect(post(T + 3_600_000).kind).toBe('start')
  })

  it('WE20: un envío en curso no inicia otro ni cuenta', () => {
    expect(post(T).kind).toBe('start')
    expect(post(T + 1000)).toEqual({ kind: 'in-progress' })
    expect(post(T + 2000)).toEqual({ kind: 'in-progress' })
    expect(findWhatsappSend(1, FOLIO)!.started).toEqual([T])
    finishWhatsappSend(1, FOLIO, { state: 'sent', wamid: 'wamid.X', at: T + 3000 })
    expect(findWhatsappSend(1, FOLIO)).toMatchObject({ state: 'sent', wamid: 'wamid.X', finishedAt: T + 3000, failure: null })
    expect(remainingSends(findWhatsappSend(1, FOLIO)!.started, T + 3000)).toBe(2)
    expect(findWhatsappSend(2, FOLIO)).toBeNull()
  })

  // The outbox lives in memory and is emptied with its own function.
  it('WE21: resetWhatsappSends vacía la bandeja', () => {
    post(T)
    expect(findWhatsappSend(1, FOLIO)).not.toBeNull()
    resetWhatsappSends()
    expect(findWhatsappSend(1, FOLIO)).toBeNull()
  })
})
