import { deleteWhatsapp } from '../../db/whatsapp.repository'

/** Removes the WhatsApp number and with it the consent (RF-WSP-04). Idempotent, like the photo. */
export default defineEventHandler(async (event): Promise<{ readonly ok: true }> => {
  const userId = await requireAccountUserId(event)
  await deleteWhatsapp(userId)
  return { ok: true }
})
