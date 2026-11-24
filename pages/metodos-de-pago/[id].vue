<script setup lang="ts">
import { evaluateSavedMethodEdit, isSavedMethodExpired, type SavedMethodChanges } from '../../server/domain/saved-payment'
import { useSessionStore } from '../../stores/session'
import type { PaymentMethodsResponse, SavedPaymentMethod } from '../../types'
import { savedMethodSuccess } from '../../utils/account-outcome'

// Editing a saved method (RN-MET-05).
useHead({ title: 'Editar método de pago · PALCO' })

function clock(): Date {
  return new Date()
}
const today = useState('payment-method-edit-today', () => toCalendarDate(clock()))

const route = useRoute()
const id = computed(() => String(route.params.id))

const failureStatus = useState<number | null>('payment-method-edit-failure-status', () => null)
const { data, error, refresh } = await useFetch<PaymentMethodsResponse>('/api/payment-methods', {
  onRequestError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
  onResponseError: (context) => {
    failureStatus.value = fetchFailureStatus(context)
  },
})

if (error.value && failureStatus.value === 401) {
  useSessionStore().clear()
  await navigateTo('/login')
}

// A missing or foreign method gives the same 404 page as /compra/inexistente, with
// the PATCH and DELETE message: telling them apart would reveal which methods exist.
const current = computed<SavedPaymentMethod | null>(() => data.value?.methods.find((method) => method.id === id.value) ?? null)
if (!error.value && current.value === null) {
  throw createError({ statusCode: 404, statusMessage: 'Método de pago inexistente', fatal: true })
}

const failedAt = useState<string | null>('payment-method-edit-failed-at', () => null)
if (error.value && failedAt.value === null) failedAt.value = formatClockTime(clock())
const failure = computed(() =>
  error.value && failureStatus.value !== 401 && failedAt.value
    ? { status: failureStatus.value ?? 0, time: failedAt.value }
    : null,
)

const serverErrors = useServerFieldErrors()
const fields = usePaymentFields(today, serverErrors)

// The fields start from what is saved. The expiry is marked as touched: an expired
// card shows its error as soon as it opens.
if (current.value) {
  fields.method.value = current.value.method
  if (current.value.method === 'paypal') {
    fields.email.value = current.value.email
  }
  else {
    fields.holder.value = current.value.holder
    fields.expiry.value = current.value.expiry
    fields.expiryTouched.value = true
  }
}

const changes = computed<SavedMethodChanges>(() =>
  fields.method.value === 'paypal'
    ? { email: fields.email.value }
    : { holder: fields.holder.value, expiry: fields.expiry.value },
)
const canSubmit = computed(() =>
  current.value !== null && evaluateSavedMethodEdit(current.value, changes.value, [], today.value).ok,
)

const { pending, alert, send, signInAgain } = useAccountRequest(clock)
const notice = useState<string | null>('payment-methods-notice', () => null)

async function submit(): Promise<void> {
  serverErrors.clearAll()
  const url: string = `/api/payment-methods/${id.value}`
  const outcome = await send(
    () => $fetch.raw<unknown>(url, { method: 'PATCH', body: changes.value, ignoreResponseError: true }),
    savedMethodSuccess,
  )
  if (outcome?.kind === 'rejected' && outcome.field !== null) {
    today.value = toCalendarDate(clock())
    serverErrors.record(outcome.field, null, outcome.message)
  }
  if (outcome?.kind !== 'saved') return
  notice.value = 'Método guardado.'
  await navigateTo('/metodos-de-pago')
}
</script>

<template>
  <div class="method-page">
    <header class="header">
      <BackLink to="/metodos-de-pago" label="Métodos de pago" />
      <h1 class="display-lg">Editar método de pago</h1>
    </header>

    <ErrorState
      v-if="failure"
      title="No pudimos cargar tus métodos de pago"
      message="Tus métodos guardados no cambiaron. Vuelve a intentarlo en un momento."
      :status="failure.status"
      :time="failure.time"
      @retry="refresh()"
    />

    <SavedMethodForm
      v-else-if="current"
      :fields="fields"
      editing
      :note="current.method === 'paypal' ? 'Para cambiar de método, elimina este y agrega otro.' : 'Para cambiar el número, elimina este método y agrega otro.'"
      submit-label="Guardar cambios"
      saving-label="Guardando cambios"
      :pending="pending"
      :alert="alert"
      :can-submit="canSubmit"
      @submit="submit"
      @cancel="navigateTo('/metodos-de-pago')"
      @sign-in="signInAgain"
    >
      <template #summary>
        <!-- What cannot be edited, as text rather than disabled fields. -->
        <div class="summary">
          <SavedMethodLines :method="current" :expired="isSavedMethodExpired(current, today)" number-only />
        </div>
      </template>
    </SavedMethodForm>
  </div>
</template>

<style scoped>
.method-page {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-5) + var(--sp-1));
}

.header {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
  align-items: flex-start;
}

.display-lg {
  margin: 0;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: calc(var(--sp-3) + 2px) var(--sp-4);
  background: var(--ink-50);
  border: var(--border);
  border-radius: var(--r-sm);
}

@media (width <= 639px) {
  .method-page {
    gap: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
