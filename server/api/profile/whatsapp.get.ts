import { findWhatsapp } from '../../db/whatsapp.repository'
import { maskWhatsapp } from '../../domain/whatsapp'
import type { WhatsappStatus } from '../../../types'

/** The user's own WhatsApp number, masked (RF-WSP-01). The user comes from the session (RN-SEG-01). */
export default defineEventHandler(async (event): Promise<WhatsappStatus> => {
  const userId = await requireAccountUserId(event)
  const stored = await findWhatsapp(userId)
  const masked = stored ? maskWhatsapp(stored.e164) : null
  return { whatsapp: masked?.ok ? { masked: masked.value } : null }
})
