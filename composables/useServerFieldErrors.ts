import type { WatchSource } from 'vue'
import { serverErrorExpires } from '../utils/server-field-errors'

/**
 * Server messages per field, after a confirmation rejection: the field shows them
 * if the client evaluator does not reject, and each one lasts until its field's
 * value changes, or a value its code depends on (`serverErrorExpires`). Field
 * names are those of the domain composites; for cinemas, seats are stored by index.
 */
export function useServerFieldErrors() {
  const fields = ref<Readonly<Record<string, { readonly message: string, readonly code: string | null }>>>({})
  const seats = ref<Readonly<Record<number, string>>>({})

  function record(field: string, seatIndex: number | null, message: string, code: string | null = null): void {
    if (field === 'seats' && seatIndex !== null) seats.value = { ...seats.value, [seatIndex]: message }
    else fields.value = { ...fields.value, [field]: { message, code } }
  }

  function clearField(field: string): void {
    if (!(field in fields.value)) return
    const { [field]: _removed, ...rest } = fields.value
    fields.value = rest
  }

  function clearSeat(index: number): void {
    if (!(index in seats.value)) return
    const { [index]: _removed, ...rest } = seats.value
    seats.value = rest
  }

  function clearAll(): void {
    fields.value = {}
    seats.value = {}
  }

  function fieldError(field: string): string | null {
    return fields.value[field]?.message ?? null
  }

  function seatError(index: number): string | null {
    return seats.value[index] ?? null
  }

  /** When `field` changes, the messages that depend on it expire. */
  function clearOnChange(field: string, source: WatchSource): void {
    watch(source, () => {
      for (const [errorField, { code }] of Object.entries(fields.value)) {
        if (serverErrorExpires(errorField, code, field)) clearField(errorField)
      }
    })
  }

  return { record, clearField, clearSeat, clearAll, fieldError, seatError, clearOnChange }
}

export type ServerFieldErrors = ReturnType<typeof useServerFieldErrors>

