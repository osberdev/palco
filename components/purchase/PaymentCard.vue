<script setup lang="ts">
import type { PaymentState } from '../../composables/usePayment'
import type { ConfirmationAlert } from '../../composables/usePurchaseConfirmation'
import { LOCKED_PAYMENT_HELP, PAYMENT_HELP } from '../../utils/payment'

interface Props {
  payment: PaymentState
  /** While confirming, read-only fields and a locked method. */
  locked?: boolean
  /** The alert from the last confirmation, or null. */
  alert?: ConfirmationAlert | null
}

const { payment, locked = false, alert = null } = defineProps<Props>()

const emit = defineEmits<{ confirm: [], signIn: [] }>()

// The saved method's refs are lifted to the top level so the template unwraps them
// and `v-model` writes into the payment state.
const {
  today,
  savedMethods,
  selectableMethods,
  selectedMethod,
  savedSecurityCode,
  savedSecurityCodeTouched,
  savedSecurityCodeError,
  savedMethodRejection,
  canConfirm,
  chooseSavedMethod,
  enterOtherMethod,
} = payment

// While confirming, the hint announces the lock.
const help = computed(() => (locked ? LOCKED_PAYMENT_HELP : PAYMENT_HELP))

const dialog = useTemplateRef<{ open: () => void }>('dialog')

// The card expired between the page and the server.
const rejectedAsExpired = computed(() => savedMethodRejection.value === 'ERR_CARD_EXPIRED')
// An expired or missing saved method does not ask for the code: it can no longer be used.
const asksSecurityCode = computed(() =>
  selectedMethod.value !== null && selectedMethod.value.method !== 'paypal' && savedMethodRejection.value === null,
)
</script>

<template>
  <section class="payment-card" aria-label="Pago">
    <!-- The saved method as text, not as disabled fields. -->
    <template v-if="selectedMethod">
      <div class="saved">
        <span class="label legend">Método de pago</span>
        <div class="summary">
          <SavedMethodLines :method="selectedMethod" :expired="rejectedAsExpired" />
        </div>
      </div>

      <div v-if="asksSecurityCode" class="code">
        <FormField id="saved-security-code" label="Código de seguridad" :help="help.securityCode" :error="savedSecurityCodeError">
          <template #default="{ describedBy, invalid }">
            <BaseInput
              id="saved-security-code"
              v-model="savedSecurityCode"
              :readonly="locked"
              mono
              inputmode="numeric"
              autocomplete="cc-csc"
              :invalid="invalid"
              :described-by="describedBy"
              @focusout="savedSecurityCodeTouched = true"
            />
          </template>
        </FormField>
        <p class="body-sm note">No se guarda; se pide en cada compra.</p>
      </div>
    </template>

    <template v-else>
      <!-- Only when some method can be chosen. -->
      <div v-if="selectableMethods.length > 0">
        <BaseButton variant="secondary" :disabled="locked" @click="dialog?.open()">Usar un método guardado</BaseButton>
      </div>
      <PaymentFields :fields="payment" :security-code="payment" :locked="locked" :help="help" />
    </template>

    <ConfirmPurchaseAction
      :alert="alert"
      :can-confirm="canConfirm"
      :submitting="locked"
      @confirm="emit('confirm')"
      @sign-in="emit('signIn')"
    />

    <div v-if="selectedMethod">
      <button type="button" class="text-button" :disabled="locked" @click="enterOtherMethod">Ingresar otro método</button>
    </div>

    <SavedMethodDialog ref="dialog" :methods="savedMethods" :today="today" @accept="chooseSavedMethod" />
  </section>
</template>

<style scoped>
.payment-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
  padding: var(--sp-6);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.saved {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.legend {
  color: var(--ink-500);
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

/* The code at half width. */
.code {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-1) + 2px);
  max-width: 50%;
}

.note {
  margin: 0;
  color: var(--ink-500);
}

.text-button {
  height: 44px;
  padding: 0 var(--sp-1);
  border: none;
  background: none;
  font: 500 var(--fs-14) var(--font-sans);
  color: var(--ink-900);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.text-button:disabled {
  color: var(--ink-400);
  cursor: not-allowed;
}

/* sm: 20 of padding and the code at full width. */
@media (width <= 639px) {
  .payment-card {
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .code {
    max-width: none;
  }
}
</style>
