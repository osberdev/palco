<script setup lang="ts">
import { evaluateQuantity } from '../../server/domain/booking'
import { parseInteger } from '../../server/domain/input'

interface Props {
  /** The field id; whoever uses it provides the visible "Cantidad" label. */
  id: string
  userLimit: number
  available: number
  describedBy?: string
  invalid?: boolean
  /** Sold-out venue: the value stays fixed and both buttons are dimmed. */
  soldOut?: boolean
}

const { id, userLimit, available, describedBy, invalid = false, soldOut = false } = defineProps<Props>()

const model = defineModel<string>({ required: true })

const parsed = computed(() => parseInteger(model.value))

const minusDisabled = computed(() => soldOut || !parsed.value.ok || parsed.value.value <= 1)

// "+" is disabled when one more ticket would exceed the effective limit
// min(userLimit, available) (RN-CAN-05). The domain decides: the limit is not
// recomputed here.
const plusDisabled = computed(() => {
  if (soldOut) return true
  if (!parsed.value.ok) return false
  const next = evaluateQuantity(parsed.value.value + 1, userLimit, available)
  return next.code === 'ERR_EXCEEDS_USER_LIMIT' || next.code === 'ERR_EXCEEDS_AVAILABILITY'
})

function decrement(): void {
  if (parsed.value.ok) model.value = String(parsed.value.value - 1)
}

// A non-integer text has no "next": + goes back to the first valid value.
function increment(): void {
  model.value = parsed.value.ok ? String(parsed.value.value + 1) : '1'
}
</script>

<template>
  <div class="stepper" :class="{ invalid }">
    <button type="button" class="step" aria-label="Quitar un boleto" :disabled="minusDisabled" @click="decrement">
      −
    </button>
    <input
      :id="id"
      v-model="model"
      type="text"
      inputmode="numeric"
      class="value"
      autocomplete="off"
      :readonly="soldOut"
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
    >
    <button type="button" class="step" aria-label="Agregar un boleto" :disabled="plusDisabled" @click="increment">
      +
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: inline-flex;
  flex: none;
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.stepper.invalid {
  border-color: var(--error);
}

/* 48 × 44 buttons and a 64 value in mono-lg. */
.step {
  width: 48px;
  height: 44px;
  border: none;
  background: var(--white);
  color: var(--ink-900);
  font: 400 var(--fs-22) var(--font-sans);
  transition: background var(--dur-fast) var(--ease);
}

.step:hover:not(:disabled) {
  background: var(--ink-50);
}

.step:disabled {
  background: var(--ink-100);
  color: var(--ink-300);
  cursor: not-allowed;
}

.value {
  width: 64px;
  height: 44px;
  padding: 0;
  border: none;
  border-inline: var(--border);
  background: var(--white);
  font: 500 var(--fs-20) var(--font-mono);
  text-align: center;
  color: var(--ink-900);
}

.value:focus-visible {
  outline-offset: -2px;
}
</style>
