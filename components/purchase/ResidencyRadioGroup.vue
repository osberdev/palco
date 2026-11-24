<script setup lang="ts">
interface Props {
  /** The museum's `residencyQuestion`. */
  question: string
}

const { question } = defineProps<Props>()

const isResident = defineModel<boolean>({ required: true })

const OPTIONS = [
  { value: true, label: 'Sí', id: 'residency-yes' },
  { value: false, label: 'No', id: 'residency-no' },
] as const
</script>

<template>
  <!--
    Two native radios in a fieldset. There is no invalid state: the choice starts on
    No (RN-COM-13).
  -->
  <fieldset class="residency-group">
    <legend class="question">{{ question }}</legend>
    <div class="options">
      <label
        v-for="option in OPTIONS"
        :key="option.label"
        class="option"
        :class="{ selected: isResident === option.value }"
      >
        <input
          :id="option.id"
          v-model="isResident"
          type="radio"
          class="radio"
          name="residency"
          :value="option.value"
        >
        {{ option.label }}
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.residency-group {
  min-width: 0;
  margin: var(--sp-1) 0 0;
  padding: 0;
  border: none;
}

/* Geist 15, outside the type scale, like the section rows. */
.question {
  padding: 0;
  margin-bottom: var(--sp-3);
  font: 500 var(--fs-15)/1.4 var(--font-sans);
  color: var(--ink-900);
}

/* Sí and No stay side by side at sm too. */
.options {
  display: flex;
  gap: var(--sp-2);
}

/* 44 tall and at least 96 wide. */
.option {
  display: flex;
  align-items: center;
  gap: calc(var(--sp-2) + 2px);
  height: 44px;
  min-width: 96px;
  padding: 0 var(--sp-4);
  border: var(--border);
  border-radius: var(--r-sm);
  background: var(--white);
  font: 500 var(--fs-14) var(--font-sans);
  color: var(--ink-900);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}

.option:hover {
  background: var(--ink-50);
}

.option.selected {
  border-color: var(--ink-900);
  background: var(--ink-900);
  color: var(--white);
}

/* The native radio receives focus; the button reflects it. */
.option:has(.radio:focus-visible) {
  outline: 2px solid var(--ink-900);
  outline-offset: 2px;
}

/* The same circle as SectionRadioGroup; when chosen, white on ink. */
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
</style>
