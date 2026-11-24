/**
 * The suite's safeguard: it only operates on `palco_test_*` databases. Everything
 * it creates, drops or truncates goes through here. No dependencies, so it can be
 * tested without a server.
 */
const TEST_DATABASE = /^palco_test_[a-z0-9_]+$/

export function assertTestDatabase(name: string): string {
  if (!TEST_DATABASE.test(name)) {
    throw new Error(`La suite de concurrencia se niega a operar sobre la base «${name}»: solo admite palco_test_*`)
  }
  return name
}

/** The same URL, for another database. */
export function urlForDatabase(url: string, database: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${database}`
  return parsed.href
}

export function hostOf(url: string): string {
  return new URL(url).host
}
