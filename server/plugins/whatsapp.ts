/**
 * Reads the WhatsApp send configuration at startup. Without it, the server starts
 * anyway and sending is unavailable (RF-ENV-09); a single warning names the
 * variables, never their values.
 */
export default defineNitroPlugin(() => {
  const parsed = parseWhatsappConfig(process.env)
  if (parsed.ok) {
    setWhatsappConfig(parsed.config)
    return
  }
  setWhatsappConfig(null)
  const reasons = [
    ...(parsed.missing.length > 0 ? [`faltan ${parsed.missing.join(', ')}`] : []),
    ...(parsed.invalid.length > 0 ? [`valor inválido en ${parsed.invalid.join(', ')}`] : []),
  ]
  console.warn(`[palco] Envío por WhatsApp no disponible: ${reasons.join('; ')}.`)
})
