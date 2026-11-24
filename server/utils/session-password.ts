/** iron-webcrypto, which seals the h3 session cookie, rejects shorter passwords. */
export const SESSION_PASSWORD_MIN_LENGTH = 32

export type SessionPasswordProblem = 'absent' | 'short'

/**
 * `NUXT_SESSION_PASSWORD` has no default: in a public repository a built-in
 * value would let anyone forge a session cookie for an installation that did not
 * set its own. Missing or shorter than 32 characters, the server does not start.
 */
export function sessionPasswordProblem(value: string | undefined): SessionPasswordProblem | null {
  if (value === undefined || value === '') return 'absent'
  if (value.length < SESSION_PASSWORD_MIN_LENGTH) return 'short'
  return null
}

/** Names the variable and how to generate it, never the value. */
export function sessionPasswordMessage(problem: SessionPasswordProblem): string {
  const fix = 'Genera una con: printf \'\\nNUXT_SESSION_PASSWORD=%s\\n\' "$(openssl rand -base64 32)" >> .env'
  return problem === 'absent'
    ? `[palco] Falta NUXT_SESSION_PASSWORD, la clave que sella la cookie de sesión: el servidor no arranca sin ella. ${fix}`
    : `[palco] NUXT_SESSION_PASSWORD tiene menos de ${SESSION_PASSWORD_MIN_LENGTH} caracteres: el servidor no arranca. ${fix}`
}
