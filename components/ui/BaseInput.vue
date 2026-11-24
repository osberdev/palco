<script setup lang="ts">
interface Props {
  id: string
  type?: 'text' | 'password'
  /** Shows the password visibility toggle (RF-AUT-16). */
  revealable?: boolean
  invalid?: boolean
  readonly?: boolean
  maxlength?: number
  autocomplete?: string
  describedBy?: string
  /** Every figure is set in mono: date, time, age and seat. Only the family changes. */
  mono?: boolean
  inputmode?: 'text' | 'numeric' | 'email'
  disabled?: boolean
}

const {
  type = 'text',
  revealable = false,
  invalid = false,
  readonly = false,
  maxlength,
  autocomplete,
  describedBy,
  mono = false,
  inputmode,
  disabled = false,
} = defineProps<Props>()

const model = defineModel<string>({ required: true })

const revealed = ref(false)
const resolvedType = computed(() => (revealable && revealed.value ? 'text' : type))

function toggleReveal(): void {
  revealed.value = !revealed.value
}
</script>

<template>
  <div class="field" :class="{ invalid, readonly, mono, disabled }">
    <input
      :id="id"
      v-model="model"
      :type="resolvedType"
      :readonly="readonly"
      :disabled="disabled"
      :inputmode="inputmode"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :aria-invalid="invalid"
      :aria-describedby="describedBy"
      spellcheck="false"
    >
    <!-- Inside the box, to the right of the text: the brand tag. -->
    <slot name="suffix" />
    <button
      v-if="revealable"
      type="button"
      class="reveal"
      :class="{ active: revealed }"
      :aria-label="revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'"
      :aria-pressed="revealed"
      :disabled="readonly"
      @click="toggleReveal"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.6" />
        <path v-if="revealed" d="m4 20 16-16" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.field {
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-2) 0 calc(var(--sp-3) + 2px);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-sm);
  transition:
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}

.field:focus-within {
  border-color: var(--ink-900);
  box-shadow: 0 0 0 3px var(--ink-100);
}

.field.invalid {
  border-color: var(--error);
}

.field.invalid:focus-within {
  box-shadow: 0 0 0 3px var(--error-subtle);
}

.field.readonly,
.field.disabled {
  background: var(--ink-50);
  cursor: not-allowed;
}

input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font: 400 var(--fs-16) var(--font-sans);
  color: var(--ink-900);
}

input:focus {
  outline: none;
}

/* The placeholder inherits the value's family. */
.mono input {
  font-family: var(--font-mono);
}

.readonly input,
.disabled input {
  color: var(--ink-400);
  cursor: not-allowed;
}

.reveal {
  flex: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-400);
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.reveal:hover:not(:disabled) {
  color: var(--ink-700);
}

.reveal.active {
  background: var(--ink-100);
  color: var(--ink-700);
}

.reveal:disabled {
  color: var(--ink-300);
  cursor: not-allowed;
}
</style>
