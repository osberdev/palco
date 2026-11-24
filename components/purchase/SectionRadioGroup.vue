<script setup lang="ts">
import type { Currency, TheaterSection } from '../../types'

interface Props {
  /** The radio group name; it also prefixes each option's id. */
  name: string
  sections: readonly TheaterSection[]
  currency: Currency
}

const { name, sections, currency } = defineProps<Props>()

const model = defineModel<number>({ required: true })
</script>

<template>
  <!--
    Native radios inside a fieldset, so the arrow keys and the screen reader behave
    as the browser defines.
  -->
  <fieldset class="section-group">
    <legend class="label legend">Sección</legend>
    <div class="options">
      <label
        v-for="(section, index) in sections"
        :key="section.name"
        class="option"
        :class="{ selected: model === index }"
      >
        <input
          v-model="model"
          type="radio"
          class="radio"
          :name="name"
          :value="index"
        >
        <span class="option-name">{{ section.name }}</span>
        <span class="mono-md price">{{ formatMoney(section.price, currency) }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.section-group {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.legend {
  padding: 0;
  margin-bottom: var(--sp-1);
  color: var(--ink-500);
}

.options {
  border: var(--border);
  border-radius: var(--r-sm);
  overflow: hidden;
}

/* The design uses 14 px of padding; literals are not allowed and --sp-3 is 2 px off. */
.option {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  height: 48px;
  padding: 0 var(--sp-3);
  background: var(--white);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}

.option + .option {
  border-top: var(--border);
}

.option:hover {
  background: var(--ink-50);
}

.option.selected {
  background: var(--ink-50);
}

/*
 * A 1 px border at rest and 5 px in ink when chosen. It is still the native input,
 * only without its appearance.
 */
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
  border: 5px solid var(--ink-900);
}

/* Geist 15, outside the type scale, like the primary button. */
.option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 400 var(--fs-15)/1.4 var(--font-sans);
  color: var(--ink-900);
}

.selected .option-name {
  font-weight: 500;
}

.price {
  flex: none;
  white-space: nowrap;
  color: var(--ink-700);
}
</style>
