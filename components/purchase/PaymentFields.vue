<script setup lang="ts">
import type { Ref } from 'vue'
import type { PaymentFieldsState } from '../../composables/usePaymentFields'
import { CARD_BRAND_LABELS, PAYMENT_HELP, type PaymentHelp } from '../../utils/payment'

/**
 * The security code: the payment asks for it, adding a saved method does not,
 * since it is never stored.
 */
export interface SecurityCodeField {
  readonly securityCode: Ref<string>
  readonly securityCodeTouched: Ref<boolean>
  readonly securityCodeError: Readonly<Ref<string | null>>
}

interface Props {
  fields: PaymentFieldsState
  /** Without it, the expiry stands alone at half width. */
  securityCode?: SecurityCodeField | null
  /** Read-only fields and a locked method while submitting. */
  locked?: boolean
  help?: PaymentHelp
  /** Without method and number, which are not editable (RN-MET-05). */
  editing?: boolean
}

const { fields, securityCode = null, locked = false, help = PAYMENT_HELP, editing = false } = defineProps<Props>()

// The refs are lifted to the top level so the template unwraps them and `v-model`
// writes into the form state.
const {
  method,
  cardNumber,
  holder,
  expiry,
  email,
  cardNumberTouched,
  holderTouched,
  expiryTouched,
  emailTouched,
  brand,
  cardCounter,
  cardNumberError,
  holderError,
  expiryError,
  emailError,
} = fields

// Without a security code, local refs the template does not show: the field is
// written like the others, with `v-model` on a ref.
const {
  securityCode: code,
  securityCodeTouched: codeTouched,
  securityCodeError: codeError,
} = securityCode ?? { securityCode: ref(''), securityCodeTouched: ref(false), securityCodeError: ref(null) }
</script>

<template>
  <!--
    No `maxlength` on any field: truncating would make the rejection for non-digit
    characters unreachable.
  -->
  <PaymentMethodGroup v-if="!editing" v-model="method" :disabled="locked" />

  <template v-if="method === 'paypal'">
    <FormField id="paypal-email" label="Correo de PayPal" :help="help.email" :error="emailError">
      <template #default="{ describedBy, invalid }">
        <BaseInput
          id="paypal-email"
          v-model="email"
          :readonly="locked"
          inputmode="email"
          autocomplete="email"
          :invalid="invalid"
          :described-by="describedBy"
          @focusout="emailTouched = true"
        />
      </template>
    </FormField>
  </template>

  <template v-else>
    <FormField
      v-if="!editing"
      id="card-number"
      label="Número de tarjeta"
      :help="help.cardNumber"
      :error="cardNumberError"
      :counter="cardCounter"
    >
      <template #default="{ describedBy, invalid }">
        <BaseInput
          id="card-number"
          v-model="cardNumber"
          :readonly="locked"
          mono
          inputmode="numeric"
          autocomplete="cc-number"
          :invalid="invalid"
          :described-by="brand ? `${describedBy} card-brand` : describedBy"
          @focusout="cardNumberTouched = true"
        >
          <template #suffix>
            <span v-if="brand" id="card-brand" class="brand">{{ CARD_BRAND_LABELS[brand] }}</span>
          </template>
        </BaseInput>
      </template>
    </FormField>

    <FormField id="card-holder" label="Nombre del titular" :help="help.holder" :error="holderError">
      <template #default="{ describedBy, invalid }">
        <BaseInput
          id="card-holder"
          v-model="holder"
          :readonly="locked"
          autocomplete="cc-name"
          :invalid="invalid"
          :described-by="describedBy"
          @focusout="holderTouched = true"
        />
      </template>
    </FormField>

    <!-- Without a security code, the expiry stands alone at half width. -->
    <div class="pair">
      <!-- No `inputmode`: the iOS numeric keyboard has no "/". -->
      <FormField id="card-expiry" label="Expiración" :help="help.expiry" :error="expiryError">
        <template #default="{ describedBy, invalid }">
          <BaseInput
            id="card-expiry"
            v-model="expiry"
            :readonly="locked"
            mono
            autocomplete="cc-exp"
            :invalid="invalid"
            :described-by="describedBy"
            @focusout="expiryTouched = true"
          />
        </template>
      </FormField>

      <FormField
        v-if="securityCode"
        id="card-security-code"
        label="Código de seguridad"
        :help="help.securityCode"
        :error="codeError"
      >
        <template #default="{ describedBy, invalid }">
          <BaseInput
            id="card-security-code"
            v-model="code"
            :readonly="locked"
            mono
            inputmode="numeric"
            autocomplete="cc-csc"
            :invalid="invalid"
            :described-by="describedBy"
            @focusout="codeTouched = true"
          />
        </template>
      </FormField>
    </div>
  </template>
</template>

<style scoped>
/* The brand tag, in the field suffix. */
.brand {
  flex: none;
  padding: calc(var(--sp-1) + 1px) var(--sp-2);
  border-radius: var(--r-xs);
  background: var(--ink-100);
  font: 500 var(--fs-12) var(--font-sans);
  color: var(--ink-700);
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
}

/* sm: expiry and code stacked, and the expiry at full width. */
@media (width <= 639px) {
  .pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
