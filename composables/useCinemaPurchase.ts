import type { MaybeRefOrGetter } from 'vue'
import { evaluateFilm, evaluateFormat, findFormat } from '../server/domain/cinema'
import {
  evaluateAttendeeAge,
  evaluateCinemaSelection,
  evaluateSeatNumbers,
  evaluateTicketQuantity,
  type CinemaSelectionInput,
} from '../server/domain/purchase'
import type { CalendarDate, CinemaDetail } from '../types'
import { CLASSIFICATION_LABELS } from '../utils/cinema'
import { useServerFieldErrors, type ServerFieldErrors } from './useServerFieldErrors'
import { useSoldOutQuantity } from './useSoldOutQuantity'

/**
 * Cinema purchase state. As with theaters, it decides nothing: every result comes
 * from `server/domain/`. Fields are evaluated separately to show every error at
 * once and the composite decides whether there is a summary; INV3 and INV4 in
 * `tests/purchase.test.ts` guarantee they do not diverge.
 */
export function useCinemaPurchase(
  detailSource: MaybeRefOrGetter<CinemaDetail>,
  todaySource: MaybeRefOrGetter<CalendarDate>,
  serverErrors: ServerFieldErrors = useServerFieldErrors(),
) {
  const detail = computed(() => toValue(detailSource))
  const today = computed(() => toValue(todaySource))
  const cinema = computed(() => detail.value.venue)

  const schedule = useEventSchedule(cinema, today, serverErrors)

  // Initial values: first film, first operated format (Tradicional in all four
  // chains), one ticket (none if the venue is sold out) and one empty seat.
  const filmIndex = ref(0)
  const age = ref('')
  const ageTouched = ref(false)
  const formatId = ref<string>(cinema.value.formats[0]?.id ?? '')
  const quantity = useSoldOutQuantity(() => detail.value.available)
  const seats = ref<string[]>([''])
  const seatsTouched = ref<boolean[]>([false])

  const filmResult = computed(() => evaluateFilm(cinema.value, filmIndex.value))
  const film = computed(() => (filmResult.value.ok ? cinema.value.films[filmIndex.value]! : null))

  const ageCheck = computed(() => evaluateAttendeeAge(film.value?.classification ?? null, age.value))
  // For each field, the client error and, if there is none, the server's after a
  // rejection. Only the server rejects the film, for a tampered request body.
  const filmError = computed(() => serverErrors.fieldError('film'))
  const ageError = computed(() =>
    (ageTouched.value && !ageCheck.value.ok ? ageCheck.value.result.message : null) ?? serverErrors.fieldError('age'),
  )
  const ageHelp = computed(() =>
    film.value ? `Clasificación ${CLASSIFICATION_LABELS[film.value.classification]}` : undefined,
  )

  // Choosing a format is the whole action: the error shows without waiting for the
  // field to lose focus.
  const formatResult = computed(() => evaluateFormat(cinema.value, formatId.value))
  const format = computed(() => findFormat(cinema.value, formatId.value))
  const formatError = computed(() => (formatResult.value.ok ? null : formatResult.value.message) ?? serverErrors.fieldError('format'))

  const quantityCheck = computed(() =>
    evaluateTicketQuantity(quantity.value, detail.value.userLimit, detail.value.available),
  )
  const quantityError = computed(() =>
    (quantityCheck.value.ok ? null : quantityCheck.value.result.message) ?? serverErrors.fieldError('quantity'),
  )

  // One seat field per ticket. With an invalid quantity the last valid number is
  // kept, and on change the values already typed are kept.
  const seatCount = ref(1)
  watch(quantityCheck, (check) => {
    if (check.ok) seatCount.value = check.value
  }, { immediate: true })
  watch(seatCount, (count) => {
    seats.value = Array.from({ length: count }, (_, index) => seats.value[index] ?? '')
    seatsTouched.value = Array.from({ length: count }, (_, index) => seatsTouched.value[index] ?? false)
  })

  const seatChecks = computed(() => (format.value ? evaluateSeatNumbers(seats.value, format.value.seats) : null))
  const seatErrors = computed(() =>
    seats.value.map((_, index) => {
      const check = seatChecks.value?.[index]
      return (seatsTouched.value[index] && check && !check.ok ? check.result.message : null) ?? serverErrors.seatError(index)
    }),
  )

  serverErrors.clearOnChange('film', filmIndex)
  serverErrors.clearOnChange('age', age)
  serverErrors.clearOnChange('format', formatId)
  serverErrors.clearOnChange('quantity', quantity)
  // Each seat clears only its own server message.
  watch(seats, (current, previous) => {
    serverErrors.clearField('seats')
    current.forEach((seat, index) => {
      if (seat !== previous[index]) serverErrors.clearSeat(index)
    })
  })

  // The composite's input is the same that travels in the confirmation body: client
  // and server evaluate exactly the same thing.
  const input = computed<CinemaSelectionInput>(() => ({
    filmIndex: filmIndex.value,
    age: age.value,
    formatId: formatId.value,
    date: schedule.date.value,
    time: schedule.time.value,
    quantity: quantity.value,
    seats: seats.value,
  }))

  const selection = computed(() =>
    evaluateCinemaSelection(
      cinema.value,
      input.value,
      detail.value.userLimit,
      detail.value.available,
      today.value,
    ),
  )

  return {
    schedule,
    cinema,
    detail,
    filmIndex,
    film,
    filmError,
    age,
    ageTouched,
    ageError,
    ageHelp,
    formatId,
    format,
    formatError,
    quantity,
    quantityError,
    seats,
    seatsTouched,
    seatErrors,
    input,
    selection,
  }
}

export type CinemaPurchaseState = ReturnType<typeof useCinemaPurchase>
