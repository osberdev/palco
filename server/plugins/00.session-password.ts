/**
 * The session sealing key at startup. Missing or too short, the server exits.
 * `scripts/start-check.ts` checks it earlier, because Nitro listens without
 * waiting for its plugins; this plugin covers `nuxt dev` and anyone who starts
 * `.output` directly. The `00.` prefix makes Nitro run it before the other plugins,
 * so a missing key is reported before any database error.
 */
export default defineNitroPlugin(() => {
  const problem = sessionPasswordProblem(process.env.NUXT_SESSION_PASSWORD)
  if (problem) {
    console.error(sessionPasswordMessage(problem))
    process.exit(1)
  }
})
