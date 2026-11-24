import { vi } from 'vitest'

/**
 * "Today" in the tests that go through the HTTP harness: October 26, 2026 at 18:00,
 * local time. The server reads the clock to decide whether a date has passed
 * (RN-CON-01); freezing it here is RNF-03 at the HTTP boundary. The fixed event
 * dates of those tests must be later, and `01/10/2026` is past on purpose.
 * The PDF carries the creation date: with it fixed, its bytes can be compared (INT9).
 */
export const NOW = new Date(2026, 9, 26, 18, 0, 0)

/**
 * Only the wall clock: timers stay real. Another instant only for a test that needs
 * it, such as the gate outside its hours; `NOW` does not change.
 */
export function freezeClock(at: Date = NOW): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  // With the clock already frozen, `useFakeTimers` does not move it: `setSystemTime` does.
  vi.setSystemTime(at)
}

export function thawClock(): void {
  vi.useRealTimers()
}
