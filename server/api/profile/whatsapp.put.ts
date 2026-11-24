import { saveWhatsapp } from '../../db/whatsapp.repository'
import { err } from '../../domain/result'
import { evaluateWhatsappRegistration, maskWhatsapp } from '../../domain/whatsapp'
import type { WhatsappSaveResponse } from '../../../types'

/**
 * Saves or replaces the user's own WhatsApp number (RN-WSP-01 to 04). It answers
 * only with the mask: the full number never leaves the server, neither in the
 * response nor in the logs.
 */
export default defineEventHandler(async (event): Promise<WhatsappSaveResponse> => {
  const userId = await requireAccountUserId(event)

  const body = parseWhatsappBody(await readJsonBody(event))
  if (!body) {
    const result = err('ERR_INPUT_INVALID')
    setResponseStatus(event, 400)
    return { ok: false, field: null, code: result.code, message: result.message }
  }

  const decided = evaluateWhatsappRegistration(body)
  if (!decided.ok) {
    setResponseStatus(event, 400)
    return { ok: false, field: decided.field, code: decided.result.code, message: decided.result.message }
  }

  await saveWhatsapp(userId, decided.e164)
  const masked = maskWhatsapp(decided.e164)
  if (!masked.ok) throw createError({ statusCode: 500, message: 'Número guardado sin máscara' })
  return { ok: true, whatsapp: { masked: masked.value } }
})
