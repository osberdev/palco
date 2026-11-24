/**
 * The ticket signing key at startup. Without it, the server starts with a
 * per-run key and warns once, naming the variable. With an invalid value it
 * exits: silently signing with another key is worse than not starting.
 * `scripts/start-check.ts` checks it earlier, because Nitro listens without
 * waiting for its plugins; this plugin covers anyone who starts `.output` directly.
 */
export default defineNitroPlugin(() => {
  const key = parseTicketSigningKey(process.env.NUXT_TICKET_SIGNING_KEY)
  if (key.kind === 'invalid') {
    console.error(ticketKeyInvalidMessage())
    process.exit(1)
  }
  if (key.kind === 'absent') {
    console.warn(TICKET_KEY_ABSENT_WARNING)
    configureTicketSigner(null)
    return
  }
  configureTicketSigner(key.seed)
})
