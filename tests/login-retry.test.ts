import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHarness, SEEDED_USERS, type Harness } from './helpers/http-harness'

// Retrying sign-in. PALCO has no password recovery and no lockout after attempts:
// whoever gets it wrong can try again. The test uses the integration harness,
// which mounts the real login endpoint, the session and a temporary database; it
// touches neither the login code nor a real database. Each case carries its
// identifier in its name.

const ANA = SEEDED_USERS[0]
// A valid format and a wrong password: it reaches bcrypt and answers 401.
const WRONG = { username: ANA.username, password: 'Palco26!' }

let harness: Harness

beforeAll(async () => {
  harness = await createHarness()
})

afterAll(async () => {
  await harness?.close()
})

describe('reintento del acceso', () => {
  it('EV6: tras cinco intentos fallidos seguidos, el sexto con las credenciales correctas da 200', async () => {
    const client = harness.client()
    const login = async (username: string, password: string) => {
      const response = await client.login(username, password)
      const json = response.json as { ok: boolean, code?: string }
      return { status: response.status, ok: json.ok, code: json.code ?? null, cookie: response.headers.get('set-cookie') !== null }
    }
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await login(WRONG.username, WRONG.password), `intento ${attempt}`).toEqual({ status: 401, ok: false, code: 'ERR_CREDENTIALS_INVALID', cookie: false })
    }
    expect(await login(ANA.username, ANA.password)).toEqual({ status: 200, ok: true, code: null, cookie: true })
    // No lockout either way: the next mistake is still a 401 and the next success, a 200.
    expect((await login(WRONG.username, WRONG.password)).status).toBe(401)
    expect((await login(ANA.username, ANA.password)).status).toBe(200)
  })
})
