import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_PASSWORD_MIN_LENGTH,
  sessionPasswordMessage,
  sessionPasswordProblem,
} from '../server/utils/session-password'

// The required session sealing key: the rule, the message, the pre-flight check of
// `bun run start` and the server plugin. Each case carries its identifier in its name.

const ROOT = resolve(import.meta.dirname, '..')
const VALID = 'k'.repeat(SESSION_PASSWORD_MIN_LENGTH)
const SHORT = 'valor-corto-que-no-debe-salir'

/** Runs `scripts/start-check.ts` with only these variables, without a database. */
function startCheck(env: Readonly<Record<string, string>>) {
  return spawnSync('node', ['--import', join(ROOT, 'scripts/resolve-ts.ts'), join(ROOT, 'scripts/start-check.ts')], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  })
}

describe('sessionPasswordProblem', () => {
  it('SK1: sin la variable o vacía → absent', () => {
    expect(sessionPasswordProblem(undefined)).toBe('absent')
    expect(sessionPasswordProblem('')).toBe('absent')
  })

  it('SK2: con menos de 32 caracteres → short', () => {
    expect(sessionPasswordProblem('k'.repeat(SESSION_PASSWORD_MIN_LENGTH - 1))).toBe('short')
    expect(sessionPasswordProblem(SHORT)).toBe('short')
  })

  it('SK3: con 32 caracteres o más → sin problema', () => {
    expect(sessionPasswordProblem(VALID)).toBeNull()
    expect(sessionPasswordProblem('k'.repeat(44))).toBeNull()
  })

  it('SK4: el mensaje nombra la variable y cómo generarla', () => {
    for (const problem of ['absent', 'short'] as const) {
      const message = sessionPasswordMessage(problem)
      expect(message).toContain('NUXT_SESSION_PASSWORD')
      expect(message).toContain('openssl rand -base64 32')
    }
    expect(sessionPasswordMessage('short')).toContain('32 caracteres')
  })
})

describe('start-check', () => {
  it('SK5: sin la variable sale con 1 antes de la base y lo dice', () => {
    const run = startCheck({})
    expect(run.status).toBe(1)
    expect(run.stderr.trim()).toBe(sessionPasswordMessage('absent'))
  })

  it('SK6: con una clave corta sale con 1, sin el valor', () => {
    const run = startCheck({ NUXT_SESSION_PASSWORD: SHORT })
    expect(run.status).toBe(1)
    expect(run.stderr.trim()).toBe(sessionPasswordMessage('short'))
    expect(run.stdout + run.stderr).not.toContain(SHORT)
  })

  it('SK10: vacía, como en .env.example, sale con 1 igual que ausente', () => {
    const run = startCheck({ NUXT_SESSION_PASSWORD: '' })
    expect(run.status).toBe(1)
    expect(run.stderr.trim()).toBe(sessionPasswordMessage('absent'))
  })

  it('SK7: con una clave válida pasa a revisar la base', () => {
    const run = startCheck({ NUXT_SESSION_PASSWORD: VALID })
    expect(run.status).toBe(1)
    expect(run.stderr.trim()).toBe('Falta NUXT_DATABASE_URL. Ver .env.example.')
  })
})

describe('plugin del servidor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  /** Runs the plugin with Nitro's auto-imports as globals; returns the exit code, if any. */
  async function runPlugin(value: string | undefined): Promise<{ readonly exitCode: number | null, readonly errors: readonly string[] }> {
    vi.stubGlobal('defineNitroPlugin', (plugin: () => void) => plugin)
    vi.stubGlobal('sessionPasswordProblem', sessionPasswordProblem)
    vi.stubGlobal('sessionPasswordMessage', sessionPasswordMessage)
    vi.stubEnv('NUXT_SESSION_PASSWORD', value)
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((message: string) => { errors.push(message) })
    let exitCode: number | null = null
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCode = code ?? 0
      return undefined as never
    }) as typeof process.exit)
    const { default: plugin } = await import('../server/plugins/00.session-password') as { default: () => void }
    plugin()
    return { exitCode, errors }
  }

  it('SK8: sin la variable o con una corta termina con 1 y el mensaje', async () => {
    expect(await runPlugin(undefined)).toEqual({ exitCode: 1, errors: [sessionPasswordMessage('absent')] })
    vi.resetModules()
    expect(await runPlugin(SHORT)).toEqual({ exitCode: 1, errors: [sessionPasswordMessage('short')] })
  })

  it('SK11: vacía termina con 1 igual que ausente', async () => {
    expect(await runPlugin('')).toEqual({ exitCode: 1, errors: [sessionPasswordMessage('absent')] })
  })

  it('SK9: con una clave válida no hace nada', async () => {
    expect(await runPlugin(VALID)).toEqual({ exitCode: null, errors: [] })
  })
})
