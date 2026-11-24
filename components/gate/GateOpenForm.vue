<script setup lang="ts">
import { useAccountRequest } from '../../composables/useAccountRequest'
import { isObject } from '../../utils/account-outcome'
import type { GateVenue } from '../../types'

interface Props {
  venues: readonly GateVenue[]
  /** The venue selected when the form opens: the one of the last closed gate. */
  initialVenueId?: string | null
  /** The page clock, for the time of a failure: no component reads the clock. */
  clock: () => Date
}

const { venues, initialVenueId = null, clock } = defineProps<Props>()

const emit = defineEmits<{
  opened: [venue: GateVenue]
  /** 503: the gate is no longer configured; the page asks again. */
  unavailable: []
}>()

const venueId = ref(
  initialVenueId !== null && venues.some((venue) => venue.id === initialVenueId) ? initialVenueId : venues[0]?.id ?? '',
)
const pin = ref('')
/** The PIN rejection, in place, until the PIN changes. */
const pinError = ref<string | null>(null)
watch(pin, () => {
  pinError.value = null
})

const { pending, alert, send } = useAccountRequest(clock)

function isGateVenue(value: unknown): value is GateVenue {
  return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

async function submit(): Promise<void> {
  // An empty PIN is not sent: it would count as a failed attempt (RN-ACC-02).
  if (pin.value === '' || pending.value) return
  pinError.value = null
  const outcome = await send(
    () => $fetch.raw<unknown>('/api/gate/open', {
      method: 'POST',
      body: { venueId: venueId.value, pin: pin.value },
      ignoreResponseError: true,
    }),
    (body) => (isGateVenue(body.venue) ? body.venue : null),
  )
  if (outcome === null) return
  if (outcome.kind === 'saved') emit('opened', outcome.value)
  else if (outcome.kind === 'rejected' && outcome.field === 'pin') pinError.value = outcome.message
  else if (outcome.kind === 'failed' && outcome.status === 503) emit('unavailable')
}
</script>

<template>
  <form class="gate-open" novalidate @submit.prevent="submit">
    <FormField id="gate-venue" label="Recinto">
      <GateVenueSelect id="gate-venue" v-model="venueId" :venues="venues" :disabled="pending" />
    </FormField>

    <FormField id="gate-pin" label="Clave de taquilla">
      <!-- The field is not marked: the rejection is the alert below. -->
      <BaseInput
        id="gate-pin"
        v-model="pin"
        type="password"
        revealable
        autocomplete="off"
        :readonly="pending"
      />
    </FormField>

    <!--
      The PIN rejection as an alert, above the button. The attempt limit (RN-ACC-02)
      and failures without a response go in the same place.
    -->
    <BaseAlert v-if="pinError" variant="error">{{ pinError }}</BaseAlert>
    <BaseAlert v-else-if="alert?.kind === 'rejected'" variant="error">{{ alert.message }}</BaseAlert>
    <AccountFailureNotice
      v-else-if="alert && !(alert.kind === 'failed' && alert.status === 503)"
      :alert="alert"
      failure-title="No pudimos abrir la taquilla"
    />

    <BaseButton type="submit" block :disabled="pin === ''" :loading="pending" loading-label="Abriendo">Abrir</BaseButton>
  </form>
</template>

<style scoped>
.gate-open {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}
</style>
