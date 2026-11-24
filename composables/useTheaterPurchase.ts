import type { MaybeRefOrGetter } from 'vue'
import { evaluateTheaterSelection, evaluateTicketQuantity, type TheaterSelectionInput } from '../server/domain/purchase'
import { evaluatePlay, evaluateSection } from '../server/domain/theater'
import type { CalendarDate, TheaterDetail } from '../types'
import { useServerFieldErrors, type ServerFieldErrors } from './useServerFieldErrors'
import { useSoldOutQuantity } from './useSoldOutQuantity'

/**
 * Theater purchase state. It decides nothing: every result comes from
 * `server/domain/`, and only what was typed and whether the field was touched are
 * kept here.
 *
 * Fields are evaluated separately to show every error at once; the composite
 * decides whether there is a summary. INV1 and INV2 in `tests/purchase.test.ts`
 * guarantee the two views do not diverge.
 */
export function useTheaterPurchase(
  detailSource: MaybeRefOrGetter<TheaterDetail>,
  todaySource: MaybeRefOrGetter<CalendarDate>,
  serverErrors: ServerFieldErrors = useServerFieldErrors(),
) {
  const detail = computed(() => toValue(detailSource))
  const today = computed(() => toValue(todaySource))
  const theater = computed(() => detail.value.venue)

  const schedule = useEventSchedule(theater, today, serverErrors)

  // Initial values: first play, first section ("Platea") and one ticket, or none if
  // the venue is sold out.
  const playIndex = ref(0)
  const sectionIndex = ref(0)
  const quantity = useSoldOutQuantity(() => detail.value.available)

  const playResult = computed(() => evaluatePlay(theater.value, playIndex.value))
  const sectionResult = computed(() => evaluateSection(theater.value, sectionIndex.value))
  // The quantity is validated immediately because its initial value is already valid.
  const quantityCheck = computed(() =>
    evaluateTicketQuantity(quantity.value, detail.value.userLimit, detail.value.available),
  )
  // The client error and, if there is none, the server's after a rejection. Only the
  // server rejects the play, for a tampered request body.
  const quantityError = computed(() =>
    (quantityCheck.value.ok ? null : quantityCheck.value.result.message) ?? serverErrors.fieldError('quantity'),
  )
  const playError = computed(() => serverErrors.fieldError('play'))
  serverErrors.clearOnChange('quantity', quantity)
  serverErrors.clearOnChange('play', playIndex)
  serverErrors.clearOnChange('section', sectionIndex)

  // The composite's input is the same that travels in the confirmation body: client
  // and server evaluate exactly the same thing.
  const input = computed<TheaterSelectionInput>(() => ({
    playIndex: playIndex.value,
    sectionIndex: sectionIndex.value,
    date: schedule.date.value,
    time: schedule.time.value,
    quantity: quantity.value,
  }))

  const selection = computed(() =>
    evaluateTheaterSelection(
      theater.value,
      input.value,
      detail.value.userLimit,
      detail.value.available,
      today.value,
    ),
  )

  return {
    ...schedule,
    theater,
    detail,
    playIndex,
    sectionIndex,
    quantity,
    playResult,
    playError,
    sectionResult,
    quantityCheck,
    quantityError,
    input,
    selection,
  }
}

export type TheaterPurchaseState = ReturnType<typeof useTheaterPurchase>
