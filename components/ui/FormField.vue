<script setup lang="ts">
interface Props {
  /** The control's id; the label points to it and the hint is named after it. */
  id: string
  label: string
  /** The rule visible before any error exists (RNF-12). */
  help?: string
  /** The domain message; it replaces the hint while it exists. */
  error?: string | null
  /** A counter to the right of the hint, as in CredentialField. */
  counter?: string
}

const { id, label, help, error = null, counter } = defineProps<Props>()

const hintId = computed(() => `${id}-hint`)
</script>

<template>
  <div class="form-field">
    <label class="label" :for="id">{{ label }}</label>
    <slot :described-by="hintId" :invalid="error !== null" />
    <div v-if="error || help || counter" class="hint-row">
      <!--
        Same pattern as CredentialField: the error is announced in the same node that
        describes the control (RNF-10).
      -->
      <span
        v-if="error || help"
        :id="hintId"
        class="hint body-sm"
        :class="{ error }"
        :role="error ? 'alert' : undefined"
      >{{ error ?? help }}</span>
      <span v-if="counter" class="counter mono-sm" :class="{ error }">{{ counter }}</span>
    </div>
  </div>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

.label {
  color: var(--ink-500);
}

.hint-row {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
}

/* --ink-500: --ink-400 on white does not reach AA at 13 px (RNF-08). */
.hint,
.counter {
  color: var(--ink-500);
}

.counter {
  flex: none;
  margin-left: auto;
}

.hint.error,
.counter.error {
  color: var(--error);
}
</style>
