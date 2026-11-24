<script setup lang="ts">
import type { CountryOption } from '../../utils/whatsapp'

interface Props {
  id: string
  options: readonly CountryOption[]
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}

const { id, options, disabled = false, invalid = false, describedBy } = defineProps<Props>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <!-- The country in a native <select>, with the code next to the name. -->
  <div class="country-select">
    <select
      :id="id"
      v-model="model"
      :disabled="disabled"
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      :class="{ invalid }"
    >
      <option v-for="option in options" :key="option.code" :value="option.code">{{ option.label }}</option>
    </select>
    <svg
      class="chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </div>
</template>

<style scoped>
/* Like PlaySelect: 48 tall, chevron on the right. */
.country-select {
  position: relative;
}

select {
  width: 100%;
  height: 48px;
  padding: 0 var(--sp-7) 0 calc(var(--sp-3) + 2px);
  appearance: none;
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-sm);
  font: 400 var(--fs-16) var(--font-sans);
  color: var(--ink-900);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease);
}

select:hover:not(:disabled) {
  border-color: var(--ink-400);
}

select:focus-visible {
  outline: none;
  border-color: var(--ink-900);
  box-shadow: 0 0 0 3px var(--ink-100);
}

select.invalid {
  border-color: var(--error);
}

select:disabled {
  background: var(--ink-50);
  color: var(--ink-400);
  cursor: not-allowed;
}

.chevron {
  position: absolute;
  top: 50%;
  right: var(--sp-3);
  transform: translateY(-50%);
  color: var(--ink-500);
  pointer-events: none;
}
</style>
