import type { MaybeRefOrGetter } from 'vue'
import { evaluateMuseumSelection, evaluateTicketQuantity, type MuseumSelectionInput } from '../server/domain/purchase'
import type { CalendarDate, MuseumDetail } from '../types'
import { useServerFieldErrors, type ServerFieldErrors } from './useServerFieldErrors'
import { useSoldOutQuantity } from './useSoldOutQuantity'

/**
 * Museum purchase state. As with theaters and cinemas, it decides nothing: every
 * result comes from `server/domain/`. Fields are evaluated separately to show
 * every error at once and the composite decides whether there is a summary; INV6
 * and INV7 in `tests/purchase.test.ts` guarantee they do not diverge.
 */
export function useMuseumPurchase(
  detailSource: MaybeRefOrGetter<MuseumDetail>,
  todaySource: MaybeRefOrGetter<CalendarDate>,
  serverErrors: ServerFieldErrors = useServerFieldErrors(),
) {
  const detail = computed(() => toValue(detailSource))
  const today = computed(() => toValue(todaySource))
  const museum = computed(() => detail.value.venue)

  const schedule = useEventSchedule(museum, today, serverErrors)

  // Residency starts on No: the general fee, without a discount nobody asked for
  // (RN-COM-13).
  const isResident = ref(false)
  const quantity = useSoldOutQuantity(() => detail.value.available)

  const quantityCheck = computed(() =>
    evaluateTicketQuantity(quantity.value, detail.value.userLimit, detail.value.available),
  )
  // The client error and, if there is none, the server's after a rejection.
  const quantityError = computed(() =>
    (quantityCheck.value.ok ? null : quantityCheck.value.result.message) ?? serverErrors.fieldError('quantity'),
  )
  serverErrors.clearOnChange('quantity', quantity)
  serverErrors.clearOnChange('residency', isResident)

  // The composite's input is the same that travels in the confirmation body: client
  // and server evaluate exactly the same thing.
  const input = computed<MuseumSelectionInput>(() => ({
    isResident: isResident.value,
    date: schedule.date.value,
    time: schedule.time.value,
    quantity: quantity.value,
  }))

  const selection = computed(() =>
    evaluateMuseumSelection(
      museum.value,
      input.value,
      detail.value.userLimit,
      detail.value.available,
      today.value,
    ),
  )

  return { schedule, museum, detail, isResident, quantity, quantityError, input, selection }
}

export type MuseumPurchaseState = ReturnType<typeof useMuseumPurchase>
