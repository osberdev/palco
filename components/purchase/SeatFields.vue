<script setup lang="ts">
interface Props {
  /** One domain message per seat, or null. */
  errors: readonly (string | null)[]
  /** The rule visible before any error (RNF-12): the room's range, or how to enable it. */
  help: string
  /** Without an operated format there is no room to validate against. */
  disabled?: boolean
}

const { errors, help, disabled = false } = defineProps<Props>()

const model = defineModel<string[]>({ required: true })

const emit = defineEmits<{ touch: [index: number] }>()

function update(index: number, value: string): void {
  model.value = model.value.map((seat, current) => (current === index ? value : seat))
}
</script>

<template>
  <!-- One field per ticket. -->
  <fieldset class="seat-fields" :class="{ disabled }" aria-describedby="seats-help">
    <legend class="label legend">Asientos</legend>
    <p id="seats-help" class="body-sm help">{{ help }}</p>
    <div class="rows">
      <div v-for="(seat, index) in model" :key="index" class="row">
        <label class="body-md seat-label" :for="`seat-${index}`">Asiento {{ index + 1 }}</label>
        <BaseInput
          :id="`seat-${index}`"
          :model-value="seat"
          class="seat-input"
          mono
          inputmode="numeric"
          autocomplete="off"
          :disabled="disabled"
          :invalid="errors[index] != null"
          :described-by="errors[index] ? `seat-${index}-error` : undefined"
          @update:model-value="update(index, $event)"
          @focusout="emit('touch', index)"
        />
        <span v-if="errors[index]" :id="`seat-${index}-error`" class="body-sm error" role="alert">
          {{ errors[index] }}
        </span>
      </div>
    </div>
  </fieldset>
</template>

<style scoped>
.seat-fields {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-2) + 2px);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.legend {
  padding: 0;
  margin-bottom: calc(var(--sp-2) + 2px);
  color: var(--ink-500);
}

.help {
  color: var(--ink-500);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

/* A label of 84, a narrow field of 120 and the error to its right. */
.row {
  display: grid;
  grid-template-columns: 84px 120px minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-4);
}

.seat-label {
  color: var(--ink-700);
}

.disabled .seat-label {
  color: var(--ink-400);
}

.error {
  color: var(--error);
}

/* sm: the field stretches and the error moves below, aligned with the field. */
@media (width <= 639px) {
  .row {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
  }

  .error {
    grid-column: 2;
  }
}
</style>
