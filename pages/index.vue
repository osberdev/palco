<script setup lang="ts">
import { useSessionStore } from '../stores/session'
import type { CatalogResponse } from '../types'

useHead({ title: 'Catálogo · PALCO' })

const store = useSessionStore()

// The only clock read: it is taken here and injected downwards, so no component
// depends on time on its own. It lives in `useState` so the server value travels
// to the client and hydration does not disagree.
const currentHour = useState('current-hour', () => new Date().getHours())

// Categories and availability come from the endpoint rather than from an import of
// `server/`: that way the mutable availability state has no second copy in the
// client bundle.
// The failure status is taken in the hooks, where the response or its absence is
// still available: useFetch's `error` no longer keeps it (utils/http.ts).
const failureStatus = useState<number | null>('home-failure-status', () => null)
const failureTimedOut = useState('home-failure-timed-out', () => false)
const { data, error, status, refresh } = await useFetch<CatalogResponse>('/api/catalog', {
  // Without blocking navigation: the page shows "Cargando el catálogo…" while the
  // data arrives. On the server it is awaited anyway.
  lazy: true,
  timeout: CATALOG_TIMEOUT_MS,
  onRequestError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
  onResponseError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
})

// Same failure time handling as the catalog.
const failedAt = useState<string | null>('home-failed-at', () => null)
// The reason is decided here, together with the time, rather than in the hooks:
// that way the trace never goes through "sin conexión" before "tiempo agotado".
if (error.value && failedAt.value === null) {
  failedAt.value = formatClockTime(new Date())
  failureTimedOut.value = isTimeoutError(error.value)
}
watch(error, (current) => {
  failedAt.value = current ? formatClockTime(new Date()) : null
  failureTimedOut.value = isTimeoutError(current)
})

const failure = computed(() =>
  error.value && failedAt.value ? { status: failureStatus.value ?? 0, timedOut: failureTimedOut.value, time: failedAt.value } : null,
)
</script>

<template>
  <div class="home">
    <HomeGreeting :display-name="store.user?.displayName ?? ''" :hour="currentHour" />

    <!--
      Before the error: when pressing "Reintentar" the wait is shown, not the earlier
      failure.
    -->
    <p v-if="status === 'pending'" class="body-lg loading" role="status">Cargando el catálogo…</p>

    <ErrorState
      v-else-if="failure"
      class="failure"
      :status="failure.status"
      :timed-out="failure.timedOut"
      :time="failure.time"
      @retry="refresh()"
    />

    <template v-else-if="data">
      <div class="categories">
        <CategoryCard v-for="category in data.categories" :key="category.slug" :category="category" />
      </div>

      <hr class="rule">

      <AvailabilityTable :venues="data.venues" />
    </template>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
}

/* Only the margin: the .categories grid spread ErrorState over three columns. */
.failure {
  margin-top: var(--sp-6);
}

/* No animation: nothing to cancel under reduced motion (RNF-11). */
.loading {
  margin-top: var(--sp-6);
  color: var(--ink-500);
}

.categories {
  margin-top: var(--sp-6);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-5);
}

.rule {
  width: 100%;
  height: 1px;
  margin: var(--sp-8) 0;
  border: none;
  background: var(--ink-200);
}

@media (width <= 1023px) {
  .categories {
    grid-template-columns: repeat(2, 1fr);
  }

  .rule {
    margin: var(--sp-5) 0;
  }
}

@media (width <= 639px) {
  .categories {
    grid-template-columns: 1fr;
    margin-top: var(--sp-5);
    gap: var(--sp-4);
  }
}
</style>
