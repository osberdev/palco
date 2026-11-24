import type { GateConfig } from '../utils/gate-config'

/**
 * Gate state in process memory: the PIN the plugin read at startup, or null
 * without a gate, and the failed PIN attempts per IP (RN-ACC-02), which reset at
 * startup, like the registration ones. Admissions do not live here: they persist
 * in the database.
 */

let config: GateConfig | null = null
const failuresByIp = new Map<string, readonly number[]>()

export function setGateConfig(next: GateConfig | null): void {
  config = next
  failuresByIp.clear()
}

export function gateConfig(): GateConfig | null {
  return config
}

export function gateFailuresFrom(ip: string): readonly number[] {
  return failuresByIp.get(ip) ?? []
}

/** With `[]` it deletes the key, like `storeRegistrationAttempts`. */
export function storeGateFailures(ip: string, failures: readonly number[]): void {
  if (failures.length === 0) failuresByIp.delete(ip)
  else failuresByIp.set(ip, failures)
}
