<script setup lang="ts">
import { useSessionStore } from '../../stores/session'
import type { PurchaseDetail } from '../../types'

// The "Antes de asistir" band runs from the top bar to the footer, like the
// purchase panel.
definePageMeta({ fullBleed: true })

const route = useRoute()
const folio = computed(() => String(route.params.folio))

// Same failure handling as the purchase: the status is taken in the hooks, where
// the response or its absence is still available (utils/http.ts).
const failureStatus = useState<number | null>('confirmation-failure-status', () => null)
const { data: purchase, error, refresh } = await useFetch<PurchaseDetail>(
  () => `/api/purchases/${encodeURIComponent(folio.value)}`,
  {
    onRequestError: (context) => {
      failureStatus.value = fetchFailureStatus(context)
    },
    onResponseError: (context) => {
      failureStatus.value = fetchFailureStatus(context)
    },
  },
)

// A 401 is a session that ended on the server without the browser knowing: the
// store is cleared and the user goes back to sign-in.
async function leaveOnUnauthorized(): Promise<void> {
  if (!error.value || failureStatus.value !== 401) return
  useSessionStore().clear()
  await navigateTo('/login')
}
await leaveOnUnauthorized()
watch(error, leaveOnUnauthorized)

// A malformed, missing or foreign folio: the same not-found state for all three (RN-CON-06).
const notFound = computed(() => error.value !== null && error.value !== undefined && failureStatus.value === 404)

useHead({
  title: () => {
    if (purchase.value) return `Compra ${purchase.value.folio} · PALCO`
    return notFound.value ? 'Compra no encontrada · PALCO' : 'Confirmación · PALCO'
  },
})

// The clock is only read on the page: the send card receives it for the time of a
// failure.
function clock(): Date {
  return new Date()
}

// The failure time is read here and passed down as a prop to ErrorState, as in the
// catalog and the purchase.
const failedAt = useState<string | null>('confirmation-failed-at', () => null)
if (error.value && failedAt.value === null) failedAt.value = formatClockTime(new Date())
watch(error, (current) => {
  failedAt.value = current ? formatClockTime(new Date()) : null
})

// Any other failure, with or without a response.
const failure = computed(() =>
  error.value && !notFound.value && failureStatus.value !== 401 && failedAt.value
    ? { status: failureStatus.value ?? 0, time: failedAt.value }
    : null,
)

// The browser does not move focus when arriving here: after confirming the route
// changes and the screen reader must hear the result.
const heading = useTemplateRef<HTMLHeadingElement>('heading')
onMounted(() => {
  heading.value?.focus({ preventScroll: true })
})
</script>

<template>
  <div class="confirmation">
    <template v-if="purchase">
      <header class="heading">
        <p class="confirmed">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m8.2 12.3 2.6 2.6 5-5.4" />
          </svg>
          Compra confirmada
        </p>
        <h1 ref="heading" class="display-lg title" tabindex="-1">{{ purchaseHeading(purchase) }}</h1>
      </header>

      <PurchaseTicketCard class="ticket" :purchase="purchase" :tickets="purchase.tickets" />

      <YourTicketsCard class="print" :folio="purchase.folio" :clock="clock" />

      <BeforeAttendingCard class="aside" :purchase="purchase" />

      <div class="actions">
        <NuxtLink to="/boletos" class="action primary">Ver mis boletos</NuxtLink>
        <NuxtLink to="/" class="action secondary">Volver al inicio</NuxtLink>
      </div>
    </template>

    <div v-else-if="notFound || failure" class="state">
      <h1 ref="heading" class="display-lg title" tabindex="-1">Confirmación</h1>
      <PurchaseNotFound v-if="notFound" />
      <ErrorState
        v-else-if="failure"
        title="No pudimos cargar la compra"
        message="Reintentar no repite la compra: solo vuelve a pedir su detalle. También puedes buscarla en Mis boletos."
        :status="failure.status"
        :time="failure.time"
        @retry="refresh()"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * A column with the ticket and a full-height 360 band. The column never exceeds
 * the container minus the band, like CheckoutLayout.
 */
.confirmation {
  --aside-width: 360px;
  --column-max-width: calc(var(--container) - var(--aside-width));

  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--aside-width);
  grid-template-rows: auto auto auto 1fr;
  grid-template-areas:
    'heading aside'
    'ticket aside'
    'print aside'
    'actions aside';
  row-gap: calc(var(--sp-5) + var(--sp-1));
}

.heading,
.ticket,
.print,
.actions {
  justify-self: center;
  width: calc(100% - 2 * var(--sp-8));
  max-width: var(--column-max-width);
}

.heading {
  grid-area: heading;
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-2) + 2px);
  padding-top: var(--sp-7);
}

.confirmed {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font: 500 var(--fs-14) var(--font-sans);
  color: var(--success);
}

.title {
  color: var(--ink-900);
  text-wrap: balance;
}

/* Focus arrives programmatically on load; it is not a control. */
.title:focus {
  outline: none;
}

.ticket {
  grid-area: ticket;
}

.print {
  grid-area: print;
}

.aside {
  grid-area: aside;
}

.actions {
  grid-area: actions;
  align-self: start;
  display: flex;
  gap: var(--sp-3);
  margin-bottom: calc(var(--sp-8) + var(--sp-2));
}

/* 48 tall like BaseButton: they are links because they navigate. */
.action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 var(--sp-5);
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  font: 500 var(--fs-15) var(--font-sans);
  text-decoration: none;
  transition:
    background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}

.primary {
  background: var(--ink-900);
  color: var(--white);
}

.primary:hover {
  background: var(--ink-700);
}

.secondary {
  background: var(--white);
  border-color: var(--ink-200);
  color: var(--ink-900);
}

.secondary:hover {
  border-color: var(--ink-400);
}

/* Title and centered card, with the column margin. */
.state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  padding: var(--sp-7) var(--sp-8) calc(var(--sp-8) + var(--sp-2));
}

/*
 * One column; "Tus boletos" and "Antes de asistir" after the ticket, and the
 * buttons side by side.
 */
@media (width <= 1023px) {
  .confirmation {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas:
      'heading'
      'ticket'
      'print'
      'aside'
      'actions';
    align-content: start;
    gap: var(--sp-5);
    padding: var(--sp-6) var(--sp-6) var(--sp-7);
  }

  .heading,
  .ticket,
  .print,
  .actions {
    width: 100%;
    max-width: none;
  }

  .heading {
    padding-top: 0;
  }

  .title {
    font-size: var(--fs-40);
  }

  .actions {
    margin-bottom: 0;
  }

  .state {
    padding: 0;
  }
}

/* sm: buttons stacked at full width. */
@media (width <= 639px) {
  .confirmation {
    gap: calc(var(--sp-4) + var(--sp-1));
    padding: var(--sp-5) calc(var(--sp-4) + var(--sp-1)) var(--sp-6);
  }

  .title {
    font-size: var(--fs-32);
  }

  .actions {
    flex-direction: column;
  }
}
</style>
