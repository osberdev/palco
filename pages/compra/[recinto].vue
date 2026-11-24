<script setup lang="ts">
import type { VenueDetail } from '../../types'

// The side panel band runs from the top bar to the footer, outside the layout container.
definePageMeta({ fullBleed: true })

const route = useRoute()
const venueId = computed(() => String(route.params.recinto))

// The clock is only read on the page: `today` is passed down as a parameter to the
// domain and the purchase receives `clock` for the time of failures. It lives in
// `useState` so server and client hydrate with the same date.
function clock(): Date {
  return new Date()
}
const today = useState('purchase-today', () => toCalendarDate(clock()))

// Same failure handling as the catalog: the status is taken in the hooks, where
// the response or its absence is still available (utils/http.ts). The 404 page
// shows the endpoint's message.
const failureStatus = useState<number | null>('venue-failure-status', () => null)
const failureMessage = useState<string | null>('venue-failure-message', () => null)
const { data, error, refresh } = await useFetch<VenueDetail>(() => `/api/venues/${venueId.value}`, {
  onRequestError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
    failureMessage.value = fetchFailureMessage(context)
  },
  onResponseError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
    failureMessage.value = fetchFailureMessage(context)
  },
})

// A missing venue ends on the same 404 page as /catalogo/opera, not in ErrorState:
// retrying would not fix it.
if (error.value && failureStatus.value === 404) {
  throw createError({
    statusCode: 404,
    statusMessage: failureMessage.value ?? 'Recinto inexistente',
    fatal: true,
  })
}

useHead({ title: () => (data.value ? `${data.value.venue.name} · PALCO` : 'Compra · PALCO') })

// After a server rejection, `today` and the detail are read again so the rejected
// field and client validation agree again. With `$fetch` rather than `refresh()`:
// a failed reload would switch the page to the error state and lose what was
// entered; in that case the previous detail is kept.
async function refreshContext(): Promise<void> {
  today.value = toCalendarDate(clock())
  try {
    data.value = await $fetch<VenueDetail>(`/api/venues/${venueId.value}`)
  }
  catch {
    // The previous detail stays.
  }
}

const failedAt = useState<string | null>('venue-failed-at', () => null)
if (error.value && failedAt.value === null) failedAt.value = formatClockTime(clock())
watch(error, (current) => {
  failedAt.value = current ? formatClockTime(clock()) : null
})

const failure = computed(() =>
  error.value && failedAt.value ? { status: failureStatus.value ?? 0, time: failedAt.value } : null,
)
</script>

<template>
  <div class="purchase">
    <!--
      Without the layout container, the error state carries its own margin. The
      category is unknown on failure: going back leads to the catalog, the same
      destination as the main navigation.
    -->
    <div v-if="failure" class="failure">
      <BackLink to="/" label="Catálogo" />
      <ErrorState
        class="failure-state"
        title="No pudimos cargar el recinto"
        :status="failure.status"
        :time="failure.time"
        @retry="refresh()"
      />
    </div>

    <TheaterCheckout v-else-if="data?.category === 'teatro'" :detail="data" :today="today" :clock="clock" :refresh-context="refreshContext" />
    <CinemaCheckout v-else-if="data?.category === 'cine'" :detail="data" :today="today" :clock="clock" :refresh-context="refreshContext" />
    <MuseumCheckout v-else-if="data?.category === 'museo'" :detail="data" :today="today" :clock="clock" :refresh-context="refreshContext" />
  </div>
</template>

<style scoped>
.purchase {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Same margin as layouts/default.vue. */
.failure {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-8) var(--sp-7);
}

.failure-state {
  margin-top: var(--sp-6);
}

@media (width <= 1023px) {
  .failure {
    padding: var(--sp-6) var(--sp-5);
  }
}

@media (width <= 639px) {
  .failure {
    padding: var(--sp-6) calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
