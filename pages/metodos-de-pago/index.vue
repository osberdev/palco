<script setup lang="ts">
import { isSavedMethodExpired, SAVED_METHODS_LIMIT } from '../../server/domain/saved-payment'
import { useSessionStore } from '../../stores/session'
import type { PaymentMethodsResponse } from '../../types'
import { deletedSuccess } from '../../utils/account-outcome'

// Saved payment methods (RF-MET-01 to 08 and 10).
useHead({ title: 'Métodos de pago · PALCO' })

// The clock is only read on the page: `today` decides which card is expired
// (RN-MET-08) and in `useState` it hydrates the same on server and client.
function clock(): Date {
  return new Date()
}
const today = useState('payment-methods-today', () => toCalendarDate(clock()))

const failureStatus = useState<number | null>('payment-methods-failure-status', () => null)
const { data, error, status, refresh } = await useFetch<PaymentMethodsResponse>('/api/payment-methods', {
  onRequestError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
  onResponseError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
})

// A 401 is a session that ended on the server: the store is cleared and the user
// goes back to sign-in, as in "Mis boletos".
async function leaveOnUnauthorized(): Promise<void> {
  if (!error.value || failureStatus.value !== 401) return
  useSessionStore().clear()
  await navigateTo('/login')
}
await leaveOnUnauthorized()
watch(error, leaveOnUnauthorized)

const failedAt = useState<string | null>('payment-methods-failed-at', () => null)
if (error.value && failedAt.value === null) failedAt.value = formatClockTime(clock())
watch(error, (current) => {
  failedAt.value = current ? formatClockTime(clock()) : null
})
const failure = computed(() =>
  error.value && failureStatus.value !== 401 && failedAt.value
    ? { status: failureStatus.value ?? 0, time: failedAt.value }
    : null,
)

const methods = computed(() => data.value?.methods ?? [])
const full = computed(() => methods.value.length >= SAVED_METHODS_LIMIT)

// Adding and editing come back here with their notice. It is taken once: a reload
// no longer shows it.
const notice = useState<string | null>('payment-methods-notice', () => null)
const success = ref(notice.value)
notice.value = null

const { pending, alert, send, dismiss, signInAgain } = useAccountRequest(clock)
const confirming = ref<string | null>(null)

function requestDelete(id: string): void {
  dismiss()
  success.value = null
  confirming.value = id
}

function cancelDelete(): void {
  dismiss()
  confirming.value = null
}

async function remove(id: string): Promise<void> {
  // As `string` rather than a template literal: Nitro's route typing does not
  // resolve a template with a dynamic segment.
  const url: string = `/api/payment-methods/${id}`
  const outcome = await send(
    () => $fetch.raw<unknown>(url, { method: 'DELETE', ignoreResponseError: true }),
    deletedSuccess,
  )
  if (outcome?.kind !== 'saved') return
  data.value = { methods: methods.value.filter((method) => method.id !== id) }
  confirming.value = null
  success.value = 'Método eliminado.'
}
</script>

<template>
  <div class="methods">
    <header class="header">
      <h1 class="display-lg">Métodos de pago</h1>
      <!-- With zero methods there is no count, only the empty state. -->
      <p v-if="!failure && methods.length > 0" class="body-lg count">
        <SegmentedText :segments="savedMethodsCount(methods.length)" />
      </p>
    </header>

    <ErrorState
      v-if="failure"
      title="No pudimos cargar tus métodos de pago"
      message="Tus métodos guardados no cambiaron. Vuelve a intentarlo en un momento."
      :status="failure.status"
      :time="failure.time"
      @retry="refresh()"
    />

    <template v-else-if="status !== 'pending'">
      <BaseAlert v-if="success" variant="success" :title="success" />
      <template v-if="alert">
        <AccountFailureNotice :alert="alert" failure-title="No pudimos eliminar el método" />
        <BaseButton v-if="alert.kind === 'unauthorized'" class="sign-in" @click="signInAgain">Iniciar sesión</BaseButton>
      </template>

      <div v-if="methods.length === 0" class="empty">
        <p class="empty-text">Aún no tienes métodos de pago guardados.</p>
        <NuxtLink to="/metodos-de-pago/nuevo" class="primary-link">Agregar método de pago</NuxtLink>
      </div>

      <!-- Most recent first (RN-MET-03) and "Agregar" at the end. -->
      <ul v-else class="grid">
        <li v-for="method in methods" :key="method.id">
          <SavedMethodCard
            :method="method"
            :expired="isSavedMethodExpired(method, today)"
            :confirming="confirming === method.id"
            :deleting="pending && confirming === method.id"
            :retry="confirming === method.id && (alert?.kind === 'offline' || alert?.kind === 'failed')"
            @request-delete="requestDelete(method.id)"
            @cancel-delete="cancelDelete"
            @confirm-delete="remove(method.id)"
          />
        </li>
        <li class="add">
          <button v-if="full" type="button" class="add-card" disabled>
            <span aria-hidden="true">+</span> Agregar método de pago
          </button>
          <NuxtLink v-else to="/metodos-de-pago/nuevo" class="add-card">
            <span aria-hidden="true">+</span> Agregar método de pago
          </NuxtLink>
          <p v-if="full" class="body-sm limit">Llegaste al máximo de 3. Elimina uno para agregar otro.</p>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.methods {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-5) + var(--sp-1));
}

.header {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
}

.display-lg,
.count,
.empty-text,
.limit {
  margin: 0;
}

.count {
  color: var(--ink-500);
}

.sign-in {
  align-self: flex-start;
}

/* The 628-wide empty state, centered. */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--sp-4) + var(--sp-1));
  width: 100%;
  max-width: 628px;
  margin: 0 auto;
  padding: var(--sp-9) var(--sp-8);
  text-align: center;
  background: var(--ink-50);
  border: var(--border);
  border-radius: var(--r-md);
}

.empty-text {
  font: 400 var(--fs-15)/1.6 var(--font-sans);
  color: var(--ink-500);
}

.primary-link {
  display: inline-flex;
  align-items: center;
  height: 48px;
  padding: 0 var(--sp-5);
  border-radius: var(--r-sm);
  background: var(--ink-900);
  color: var(--white);
  font: 500 var(--fs-15) var(--font-sans);
  text-decoration: none;
  transition: background var(--dur-fast) var(--ease);
}

.primary-link:hover {
  background: var(--ink-700);
}

/* Three columns at lg and xl, two at md and one at sm. */
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-4);
  align-items: stretch;
  margin: 0;
  padding: 0;
  list-style: none;
}

.grid > li {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.grid > li > :first-child {
  flex: 1;
}

.add {
  gap: var(--sp-2);
}

.add-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--sp-2) + 2px);
  min-height: 172px;
  width: 100%;
  border: var(--border);
  border-radius: var(--r-md);
  background: var(--white);
  font: 500 var(--fs-15) var(--font-sans);
  color: var(--ink-900);
  text-decoration: none;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}

.add-card:hover:not(:disabled) {
  background: var(--ink-50);
}

/* Disabled with three methods (RN-MET-02). */
.add-card:disabled {
  min-height: 120px;
  background: var(--ink-50);
  color: var(--ink-400);
  cursor: not-allowed;
}

.limit {
  color: var(--ink-500);
}

@media (width <= 1023px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width <= 639px) {
  .methods {
    gap: calc(var(--sp-4) + var(--sp-1));
  }

  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .empty {
    padding: var(--sp-7) var(--sp-5);
  }
}
</style>
