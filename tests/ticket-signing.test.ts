import { describe, expect, it } from 'vitest'
import { TICKET_ID_BYTES, formatQrPayload, issueTickets, parseQrPayload } from '../server/domain/ticket'
import { createTicketSigner, ticketSigner } from '../server/utils/ticket-signing'

// Ed25519 ticket signatures with the per-run key (RN-BOL-02 and 03). Each case
// carries its identifier in its name.

const ID = Uint8Array.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x01, 0x23])

function flipped(bytes: Uint8Array, index: number): Uint8Array {
  const copy = Uint8Array.from(bytes)
  copy[index] = copy[index]! ^ 0b1
  return copy
}

describe('firma de los boletos', () => {
  it('BT10: firma y verifica', () => {
    const signer = createTicketSigner()
    const signature = signer.sign(ID)
    expect(signature).toHaveLength(64)
    expect(signer.verify(ID, signature)).toBe(true)
  })

  it('BT11: un bit cambiado en el id no verifica', () => {
    const signer = createTicketSigner()
    const signature = signer.sign(ID)
    for (let index = 0; index < ID.length; index++) expect(signer.verify(flipped(ID, index), signature)).toBe(false)
  })

  it('BT12: un bit cambiado en la firma no verifica', () => {
    const signer = createTicketSigner()
    const signature = signer.sign(ID)
    for (const index of [0, 31, 32, 63]) expect(signer.verify(ID, flipped(signature, index))).toBe(false)
  })

  it('BT13: la firma de otra ejecución no verifica (RN-BOL-03)', () => {
    const previous = createTicketSigner()
    const current = createTicketSigner()
    expect(current.verify(ID, previous.sign(ID))).toBe(false)
  })

  it('BT14: ticketSigner devuelve el mismo firmante en dos llamadas', () => {
    const first = ticketSigner()
    expect(ticketSigner()).toBe(first)
    expect(ticketSigner().verify(ID, first.sign(ID))).toBe(true)
  })

  it('BT15: verify con una firma o un id mal formados responde false sin lanzar', () => {
    const signer = createTicketSigner()
    expect(signer.verify(ID, new Uint8Array(10))).toBe(false)
    expect(signer.verify(new Uint8Array(9), signer.sign(ID))).toBe(false)
  })
})

describe('emisión y lectura', () => {
  it('INV28: emitir, armar el QR y leerlo devuelve los mismos ids, y cada firma verifica', () => {
    const signer = createTicketSigner()
    for (let quantity = 1; quantity <= 10; quantity++) {
      const ids = Array.from({ length: quantity }, (_, index) =>
        Uint8Array.from({ length: TICKET_ID_BYTES }, (_, byte) => (quantity * 31 + index * 17 + byte * 7) % 256))
      const issued = issueTickets(quantity, ids)
      expect(issued.ok).toBe(true)
      if (!issued.ok) continue

      const read = issued.value.map((id) => {
        const payload = formatQrPayload(id, signer.sign(id))
        if (!payload.ok) throw new Error('El contenido debe armarse')
        const parsed = parseQrPayload(payload.value)
        if (!parsed.ok) throw new Error('El contenido debe leerse')
        return parsed.value
      })
      expect(read.map((entry) => entry.id)).toEqual(ids)
      for (const entry of read) expect(signer.verify(entry.id, entry.signature)).toBe(true)
    }
  })
})
