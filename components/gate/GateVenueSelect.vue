<script setup lang="ts">
import type { GateVenue } from '../../types'

interface Props {
  id: string
  venues: readonly GateVenue[]
  disabled?: boolean
}

const { id, venues, disabled = false } = defineProps<Props>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <!-- The venue in a native <select>, with all twelve in catalog order. -->
  <div class="venue-select">
    <select :id="id" v-model="model" :disabled="disabled">
      <option v-for="venue in venues" :key="venue.id" :value="venue.id">{{ venue.name }}</option>
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
/* Like CountrySelect and PlaySelect: 48 tall, chevron on the right. */
.venue-select {
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
