<script setup lang="ts">
import type { CatalogResponse, CategorySlug } from '../../types'

definePageMeta({
  // A category that does not exist in the URL answers 404 (/catalogo/opera).
  validate: (route) => isCategorySlug(route.params.categoria),
})

const route = useRoute()
const slug = computed(() => route.params.categoria as CategorySlug)
const title = computed(() => categoryTitle(slug.value))

useHead({ title: () => `${title.value} · PALCO` })

// The failure status is taken in the hooks, where the response or its absence is
// still available: useFetch's `error` no longer keeps it (utils/http.ts).
const failureStatus = useState<number | null>('catalog-failure-status', () => null)
const failureTimedOut = useState('catalog-failure-timed-out', () => false)

// useFetch forwards the session cookie during server rendering, so the endpoint
// sees the same session as the browser.
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

const category = computed(() => data.value?.categories.find((c) => c.slug === slug.value) ?? null)

// Filtered on the client, keeping the catalog order.
const venues = computed(() => data.value?.venues.filter((v) => v.category === slug.value) ?? [])

// No initial selection, and it is cleared when the category changes.
const selectedId = ref<string | null>(null)
watch(slug, () => {
  selectedId.value = null
})
const selectedVenue = computed(() => venues.value.find((v) => v.id === selectedId.value) ?? null)

// The failure time is read here and passed down as a prop to ErrorState. It lives
// in `useState` so that, if server rendering fails, the client hydrates with the
// same time; the watch renews it on every later failure.
const failedAt = useState<string | null>('catalog-failed-at', () => null)
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
  <div class="catalog">
    <header class="header">
      <div class="heading">
        <BackLink to="/" />
        <h1 class="display-lg">{{ title }}</h1>
        <p v-if="category" class="mono-sm facts">
          {{ category.countLabel }} · máx. {{ category.maxTickets }} boletos por usuario y fecha · moneda local sin conversión
        </p>
      </div>
      <CategoryTabs :active="slug" />
    </header>

    <!--
      Before the error: when pressing "Reintentar" the wait is shown, not the earlier
      failure.
    -->
    <p v-if="status === 'pending'" class="body-lg loading" role="status">Cargando el catálogo…</p>

    <ErrorState
      v-else-if="failure"
      :status="failure.status"
      :timed-out="failure.timedOut"
      :time="failure.time"
      @retry="refresh()"
    />

    <template v-else>
      <!-- The fieldset groups the radios each VenueCard carries. -->
      <fieldset class="grid choices">
        <legend class="visually-hidden">Elige un recinto</legend>
        <VenueCard
          v-for="venue in venues"
          :key="venue.id"
          :venue="venue"
          :selected="venue.id === selectedId"
          @select="selectedId = $event"
        />
      </fieldset>

      <CatalogSelectionBar :venue="selectedVenue" />
    </template>
  </div>
</template>

<style scoped>
.catalog {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--sp-5);
}

.heading {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.facts {
  color: var(--ink-500);
}

/* No animation: nothing to cancel under reduced motion (RNF-11). */
.loading {
  color: var(--ink-500);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-5);
}

.choices {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

@media (width <= 1023px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .heading h1 {
    font-size: var(--fs-40);
  }
}

@media (width <= 639px) {
  .catalog {
    gap: var(--sp-5);
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  .heading h1 {
    font-size: var(--fs-32);
  }

  .grid {
    grid-template-columns: 1fr;
    gap: var(--sp-4);
  }
}
</style>
