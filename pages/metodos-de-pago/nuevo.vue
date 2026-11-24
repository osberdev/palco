<script setup lang="ts">
import { evaluateNewSavedMethod } from '../../server/domain/saved-payment'
import { savedMethodSuccess } from '../../utils/account-outcome'

// Adding a saved method (RF-MET-03). A route of its own rather than a step: Back
// and reload behave like the rest of the site.
useHead({ title: 'Agregar método de pago · PALCO' })

function clock(): Date {
  return new Date()
}
const today = useState('payment-method-new-today', () => toCalendarDate(clock()))

const serverErrors = useServerFieldErrors()
const fields = usePaymentFields(today, serverErrors)

// Without the security code, which is never stored (RN-MET-04).
const input = computed(() => ({
  method: fields.method.value,
  cardNumber: fields.cardNumber.value,
  holder: fields.holder.value,
  expiry: fields.expiry.value,
  email: fields.email.value,
}))

// "Guardar método" is enabled with valid fields. The server decides both limits
// and duplicates with the saved methods and the day's additions, which the page
// does not know (RN-MET-10).
const canSubmit = computed(() => evaluateNewSavedMethod(input.value, [], 0, today.value).ok)

const { pending, alert, send, signInAgain } = useAccountRequest(clock)
const notice = useState<string | null>('payment-methods-notice', () => null)

async function submit(): Promise<void> {
  serverErrors.clearAll()
  const outcome = await send(
    () => $fetch.raw<unknown>('/api/payment-methods', { method: 'POST', body: input.value, ignoreResponseError: true }),
    savedMethodSuccess,
  )
  if (outcome?.kind === 'rejected' && outcome.field !== null) {
    // After reading `today` again, so the field and the client agree.
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
      <h1 class="display-lg">Agregar método de pago</h1>
    </header>

    <SavedMethodForm
      :fields="fields"
      note="El código de seguridad no se guarda: te lo pediremos en cada compra."
      submit-label="Guardar método"
      saving-label="Guardando método"
      :pending="pending"
      :alert="alert"
      :can-submit="canSubmit"
      @submit="submit"
      @cancel="navigateTo('/metodos-de-pago')"
      @sign-in="signInAgain"
    />
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

@media (width <= 639px) {
  .method-page {
    gap: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
