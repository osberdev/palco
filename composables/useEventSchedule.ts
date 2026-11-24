import type { MaybeRefOrGetter } from 'vue'
import { applicableHours } from '../server/domain/calendar'
import { evaluateEventDate, evaluateEventTime } from '../server/domain/purchase'
import type { CalendarDate, VenueBase } from '../types'
import { useServerFieldErrors, type ServerFieldErrors } from './useServerFieldErrors'

/**
 * Event date and time, shared by theater, cinema and museum purchases. Like the
 * rest of the purchase, it decides nothing: every result comes from `server/domain/`.
 */
export function useEventSchedule(
  venueSource: MaybeRefOrGetter<VenueBase>,
  todaySource: MaybeRefOrGetter<CalendarDate>,
  serverErrors: ServerFieldErrors = useServerFieldErrors(),
) {
  const venue = computed(() => toValue(venueSource))
  const today = computed(() => toValue(todaySource))

  // There is no meaningful default: they start empty.
  const date = ref('')
  const time = ref('')

  // The error appears after the first blur, not while typing.
  const dateTouched = ref(false)
  const timeTouched = ref(false)

  const dateCheck = computed(() => evaluateEventDate(venue.value, date.value, today.value))
  const validDate = computed(() => (dateCheck.value.ok ? dateCheck.value.value : null))
  const timeCheck = computed(() => evaluateEventTime(venue.value, validDate.value, time.value))

  // The client error and, if there is none, the server's after a rejection.
  const dateError = computed(() =>
    (dateTouched.value && !dateCheck.value.ok ? dateCheck.value.result.message : null) ?? serverErrors.fieldError('date'),
  )
  const timeError = computed(() =>
    (timeTouched.value && !timeCheck.value.ok ? timeCheck.value.result.message : null) ?? serverErrors.fieldError('time'),
  )
  serverErrors.clearOnChange('date', date)
  serverErrors.clearOnChange('time', time)

  const dateHelp = computed(() => {
    const note = closedDaysNote(venue.value)
    return note ? `Formato DD/MM/AAAA · ${note}` : 'Formato DD/MM/AAAA'
  })

  const timeHelp = computed(() => {
    if (!validDate.value) return 'Formato HH:MM, 24 horas'
    const hours = applicableHours(venue.value, validDate.value)
    return `Formato HH:MM · abre de ${formatClock(hours.open)} a ${formatClock(hours.close)}`
  })

  return {
    date,
    time,
    dateTouched,
    timeTouched,
    dateCheck,
    validDate,
    timeCheck,
    dateError,
    timeError,
    dateHelp,
    timeHelp,
  }
}

export type EventSchedule = ReturnType<typeof useEventSchedule>
