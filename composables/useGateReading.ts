import { classifyAdmissionResponse, readingFrom, withReading, type AdmissionOutcome, type ReadingRow, type ReadingView } from '../utils/gate-reading'

/**
 * Gate scanning: sends a code, sets "Última lectura" and adds the row to "Últimas
 * lecturas", which live in the page's memory. A second submission in progress
 * does nothing. The clock comes from the page.
 */
export function useGateReading(clock: () => Date) {
  const pending = ref(false)
  const last = ref<ReadingView | null>(null)
  const rows = ref<readonly ReadingRow[]>([])

  /**
   * Returns the result so the page can go back to the venue list or the
   * unconfigured state; null if one was already in progress.
   */
  async function validate(code: string): Promise<AdmissionOutcome | null> {
    if (pending.value) return null
    pending.value = true
    let outcome: AdmissionOutcome
    try {
      const response = await $fetch.raw<unknown>('/api/gate/admissions', {
        method: 'POST',
        body: { code },
        ignoreResponseError: true,
      })
      outcome = classifyAdmissionResponse(response.status, response._data)
    }
    catch {
      outcome = classifyAdmissionResponse(0, null)
    }
    finally {
      pending.value = false
    }

    const reading = readingFrom(outcome, () => formatClockTime(clock()), (iso) => formatClockTime(new Date(iso)))
    if (reading) {
      last.value = reading.view
      rows.value = withReading(rows.value, reading.row)
    }
    return outcome
  }

  return { pending, last, rows, validate }
}
