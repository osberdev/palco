<script setup lang="ts">
import { useSessionStore } from '../stores/session'
import type { PurchasesResponse } from '../types'

// The purchases the user has confirmed (RF-BOL-01). Without purchases, the empty
// state (RF-BOL-02).
useHead({ title: 'Mis boletos · PALCO' })

// Same failure handling as the catalog: the status is taken in the hooks, where
// the response or its absence is still available (utils/http.ts).
const failureStatus = useState<number | null>('tickets-failure-status', () => null)
const { data, error, status, refresh } = await useFetch<PurchasesResponse>('/api/purchases', {
  onRequestError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
  onResponseError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
})

// A 401 is a session that ended on the server without the browser knowing: the
// store is cleared and the user goes back to sign-in.
async function leaveOnUnauthorized(): Promise<void> {
  if (!error.value || failureStatus.value !== 401) return
  useSessionStore().clear()
  await navigateTo('/login')
}
await leaveOnUnauthorized()
watch(error, leaveOnUnauthorized)

const purchases = computed(() => data.value?.purchases ?? [])
const countLabel = computed(() => purchasesCountLabel(purchases.value.length))

// The failure time is read here and passed down as a prop to ErrorState, as in the catalog.
const failedAt = useState<string | null>('tickets-failed-at', () => null)
if (error.value && failedAt.value === null) failedAt.value = formatClockTime(new Date())
watch(error, (current) => {
  failedAt.value = current ? formatClockTime(new Date()) : null
})

const failure = computed(() =>
  error.value && failureStatus.value !== 401 && failedAt.value
    ? { status: failureStatus.value ?? 0, time: failedAt.value }
    : null,
)

// "Enviar a WhatsApp" per row. The clock is only read on the page.
function clock(): Date {
  return new Date()
}
const { busyFolio, alert: sendAlert, send } = useRowTicketsSend(clock)
const dialog = useTemplateRef<{ open: () => Promise<void> }>('dialog')
let pendingFolio: string | null = null

async function sendTickets(folio: string): Promise<void> {
  if ((await send(folio)) !== 'notRegistered') return
  pendingFolio = folio
  await dialog.value?.open()
}

// "Guardar y enviar": the dialog saved the number and closed.
async function savedAndSend(): Promise<void> {
  const folio = pendingFolio
  pendingFolio = null
  if (folio) await send(folio)
}
</script>

<template>
  <div class="tickets">
    <header class="header">
      <h1 class="display-lg">Mis boletos</h1>
      <!-- The figure in mono; the rest of the text comes from `purchasesCountLabel`. -->
      <p v-if="!failure && purchases.length > 0" class="body-lg count">
        <span class="count-number">{{ purchases.length }}</span>{{ countLabel.slice(String(purchases.length).length) }}
      </p>
    </header>

    <ErrorState
      v-if="failure"
      title="No pudimos cargar tus boletos"
      message="Tus compras no se modifican al reintentar."
      :status="failure.status"
      :time="failure.time"
      @retry="refresh()"
    />

    <template v-else-if="status !== 'pending'">
      <!-- Each row opens its folio's confirmation. -->
      <!-- A single alert, the one from the last send from a row. -->
      <BaseAlert v-if="sendAlert" class="send-alert" :variant="sendAlert.variant" :title="sendAlert.title">
        <span v-if="sendAlert.trace" class="trace">{{ sendAlert.trace }}</span>
      </BaseAlert>

      <ul v-if="purchases.length > 0" class="list">
        <!-- The row is still the link to the confirmation, and printing goes outside it. -->
        <li v-for="purchase in purchases" :key="purchase.folio" class="entry">
          <PurchaseListRow class="row" :purchase="purchase" />
          <div class="row-actions">
            <PrintTicketsLink class="row-action" :folio="purchase.folio" named-by-folio compact />
            <BaseButton
              variant="secondary"
              class="row-action send"
              :aria-label="`Enviar a WhatsApp los boletos de ${purchase.folio}`"
              :loading="busyFolio === purchase.folio"
              loading-label="Enviando"
              :disabled="busyFolio !== null && busyFolio !== purchase.folio"
              @click="sendTickets(purchase.folio)"
            >
              <span class="content">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 3 10 14" />
                  <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                </svg>
                Enviar a WhatsApp
              </span>
            </BaseButton>
          </div>
        </li>
      </ul>

      <EmptyState
        v-else
        title="Aún no tienes boletos"
        text="Las compras que confirmes aparecerán aquí."
        illustration="/img/estado-vacio.jpg"
      >
        <template #action>
          <NuxtLink to="/" class="catalog-link">Ir al catálogo</NuxtLink>
        </template>
      </EmptyState>
    </template>

    <ClientOnly>
      <WhatsappDialog ref="dialog" submit-label="Guardar y enviar" :clock="clock" @saved="savedAndSend" />
    </ClientOnly>
  </div>
</template>

<style scoped>
.tickets {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.header {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
}

.count {
  color: var(--ink-500);
}

.count-number {
  font-family: var(--font-mono);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* The row and, to its right, the two actions stacked and vertically centered. */
.entry {
  display: flex;
  align-items: stretch;
  gap: var(--sp-4);
}

.row {
  flex: 1;
  min-width: 0;
}

.row-actions {
  display: flex;
  flex: none;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp-2);
}

/* 44 tall with 14 px text, like the compact PrintTicketsLink. */
.row-action.send {
  height: 44px;
  padding: 0 calc(var(--sp-3) + 2px);
  font-size: var(--fs-14);
}

.content {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  white-space: nowrap;
}

/* Mono 12, in the alert color. */
.trace {
  display: block;
  margin-top: 2px;
  font: 400 var(--fs-12) var(--font-mono);
}

/*
 * A compact primary button, the same as "Reintentar" in ErrorState: it is a link
 * because it navigates.
 */
.catalog-link {
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0 calc(var(--sp-4) + var(--sp-1));
  border-radius: var(--r-sm);
  background: var(--ink-900);
  color: var(--white);
  font: 500 var(--fs-14) var(--font-sans);
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease);
}

.catalog-link:hover {
  background: var(--ink-700);
}

@media (width <= 1023px) {
  .tickets h1 {
    font-size: var(--fs-40);
  }
}

@media (width <= 639px) {
  .tickets {
    gap: var(--sp-5);
  }

  .tickets h1 {
    font-size: var(--fs-32);
  }

  /* Geist 14 for the count. */
  .count {
    font-size: var(--fs-14);
  }

  /* The two actions under the row, side by side. */
  .list {
    gap: var(--sp-4);
  }

  .entry {
    flex-direction: column;
    gap: var(--sp-2);
  }

  .row-actions {
    flex-direction: row;
  }

  .row-action {
    flex: 1;
    min-width: 0;
  }
}
</style>
