<script setup lang="ts">
import type { GateStatus, GateVenue } from '../types'

// The gate (RF-ACC-01): an open route, with or without a session. Without a
// configuration, only the message; closed, the opening form; open, scanning with
// the camera and the short code. The page wraps its own layout: see
// `layouts/gate.vue`.
definePageMeta({ layout: false })

const failureStatus = useState<number | null>('gate-failure-status', () => null)
const { data: status, error, refresh } = await useFetch<GateStatus>('/api/gate', {
  onRequestError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
  onResponseError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
})

const open = computed(() => status.value?.venue ?? null)
useHead({ title: computed(() => (open.value ? `Acceso · ${open.value.name} · PALCO` : 'Abrir taquilla · PALCO')) })

/** The last opened venue: "Cerrar taquilla" returns to the opening form with it selected. */
const lastVenueId = useState<string | null>('gate-last-venue', () => null)

// Also the one opened through the cookie, after a reload: closing it returns to the
// opening form with it selected.
watch(open, (venue) => {
  if (venue) lastVenueId.value = venue.id
}, { immediate: true })

/** The gate closed on its own (another tab, the cookie expired): the opening form says so. */
const closedNotice = ref<string | null>(null)

function opened(venue: GateVenue): void {
  closedNotice.value = null
  if (status.value) status.value = { ...status.value, venue }
}

const closing = ref(false)
/**
 * Idempotent on the server: even if the request fails, the screen returns to the
 * opening form.
 */
async function close(): Promise<void> {
  if (closing.value) return
  closing.value = true
  try {
    await $fetch('/api/gate/close', { method: 'POST' })
  }
  catch {
    // Without a response the cookie may remain: the next load will tell.
  }
  finally {
    closing.value = false
    if (status.value) status.value = { ...status.value, venue: null }
  }
}

// The clock is only read on the page: the time of a failure.
function clock(): Date {
  return new Date()
}

/**
 * A 401 while scanning: the gate closed on its own, and the screen returns to the
 * opening form with the venue.
 */
function closedElsewhere(message: string): void {
  closedNotice.value = message
  if (status.value) status.value = { ...status.value, venue: null }
}

const failedAt = useState<string | null>('gate-failed-at', () => null)
if (error.value && failedAt.value === null) failedAt.value = formatClockTime(new Date())
watch(error, (current) => {
  failedAt.value = current ? formatClockTime(new Date()) : null
})

// When opening or closing, focus goes to the new title: without a route change a
// screen reader would not notice (like step 2 of the purchase).
const heading = useTemplateRef<HTMLHeadingElement>('heading')
watch(open, async () => {
  await nextTick()
  heading.value?.focus()
})
</script>

<template>
  <NuxtLayout name="gate" :venue="open" :closing="closing" @close="close">
    <ErrorState
      v-if="error && failedAt"
      title="No pudimos cargar la taquilla"
      :status="failureStatus ?? 0"
      :time="failedAt"
      @retry="refresh"
    />

    <section v-else-if="open" class="reading" aria-labelledby="reading-title">
      <h1 id="reading-title" ref="heading" class="display-lg" tabindex="-1">Acceso</h1>
      <GateReadingPanel :clock="clock" @closed="closedElsewhere" @unavailable="refresh" />
    </section>

    <section v-else-if="status" class="open-card" aria-labelledby="gate-title">
      <h1 id="gate-title" ref="heading" class="display-lg" tabindex="-1">Abrir taquilla</h1>
      <!-- Only the message, without a form. -->
      <BaseAlert v-if="!status.configured" variant="error">La taquilla no está configurada en este servidor</BaseAlert>
      <template v-else>
        <BaseAlert v-if="closedNotice" variant="info">{{ closedNotice }}</BaseAlert>
        <GateOpenForm
          :venues="status.venues"
          :initial-venue-id="lastVenueId"
          :clock="clock"
          @opened="opened"
          @unavailable="refresh"
        />
      </template>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.open-card {
  max-width: 440px;
  margin: 0 auto;
  padding: var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.open-card h1 {
  font-size: var(--fs-40);
}

.open-card h1,
.reading h1 {
  outline: none;
}

.reading {
  width: 100%;
  max-width: var(--container);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-5) + var(--sp-1));
}

.reading h1 {
  margin: 0;
}

@media (width <= 1023px) {
  .reading h1 {
    font-size: var(--fs-40);
  }
}

@media (width <= 639px) {
  .open-card {
    padding: var(--sp-5);
  }

  .open-card h1 {
    font-size: var(--fs-36);
  }

  .reading {
    gap: calc(var(--sp-4) + var(--sp-1));
  }

  .reading h1 {
    font-size: var(--fs-32);
  }
}
</style>
