<script setup lang="ts">
import { PAYMENT_METHODS } from '../../server/domain/payment'
import type { PaymentMethod } from '../../types'
import { PAYMENT_METHOD_LABELS } from '../../utils/payment'

interface Props {
  /** The method does not change while confirming. */
  disabled?: boolean
}

const { disabled = false } = defineProps<Props>()

const method = defineModel<PaymentMethod>({ required: true })
</script>

<template>
  <!--
    Three native radios drawn as cards, so the arrow keys change the method, as in
    ResidencyRadioGroup.
  -->
  <fieldset class="payment-method-group" :disabled="disabled">
    <legend class="label legend">Método de pago</legend>
    <div class="options">
      <label
        v-for="option in PAYMENT_METHODS"
        :key="option"
        class="option"
        :class="{ selected: method === option, disabled }"
      >
        <input v-model="method" type="radio" class="radio" name="payment-method" :value="option">
        {{ PAYMENT_METHOD_LABELS[option] }}
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.payment-method-group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.legend {
  padding: 0;
  margin-bottom: var(--sp-2);
  color: var(--ink-500);
}

.options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}

/* 44 tall, like the residency buttons. */
.option {
  display: flex;
  align-items: center;
  gap: calc(var(--sp-2) + 2px);
  height: 44px;
  min-width: 0;
  padding: 0 var(--sp-4);
  border: var(--border);
  border-radius: var(--r-sm);
  background: var(--white);
  font: 500 var(--fs-14) var(--font-sans);
  color: var(--ink-900);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}

.option:hover:not(.disabled) {
  background: var(--ink-50);
}

/* Locked while confirming. */
.option.disabled {
  background: var(--ink-50);
  color: var(--ink-400);
  cursor: not-allowed;
}

.option.disabled.selected {
  border-color: var(--ink-400);
  background: var(--ink-400);
  color: var(--white);
}

.option.disabled .radio {
  cursor: not-allowed;
}

.option.selected {
  border-color: var(--ink-900);
  background: var(--ink-900);
  color: var(--white);
}

/* The native radio receives focus; the card reflects it. */
.option:has(.radio:focus-visible) {
  outline: 2px solid var(--ink-900);
  outline-offset: 2px;
}

.radio {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  appearance: none;
  border: 1px solid var(--ink-300);
  border-radius: var(--r-full);
  background: var(--white);
  cursor: pointer;
}

.radio:checked {
  border: 5px solid var(--white);
  background: var(--ink-900);
}

/* sm: stacked. */
@media (width <= 639px) {
  .options {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
