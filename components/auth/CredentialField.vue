<script setup lang="ts">
import type { CredentialFieldState } from '../../composables/useCredentialValidation'

interface Props {
  id: string
  label: string
  /** The rule text, visible before any error exists (RNF-12). */
  rule: string
  ruleShort?: string
  state: CredentialFieldState
  type?: 'text' | 'password'
  revealable?: boolean
  readonly?: boolean
  readonlyHint?: string
  autocomplete?: string
  /** Counter length; UTF-16 units by default. The name counts code points. */
  measure?: (text: string) => number
  /**
   * Enforces the maximum with `maxlength`. The name does not: with it,
   * `ERR_NAME_TOO_LONG` would be unreachable, and `maxlength` counts UTF-16.
   */
  enforceLimit?: boolean
  counter?: boolean
  /** The server's message after a rejection; shown if the client does not reject. */
  serverError?: string | null
  /** Hint for a valid field; null keeps the rule, like the password confirmation. */
  validHint?: string | null
}

const {
  id,
  label,
  rule,
  ruleShort,
  state,
  type = 'text',
  revealable = false,
  readonly = false,
  readonlyHint = 'Solo lectura durante el envío',
  autocomplete,
  measure = (text: string) => text.length,
  enforceLimit = true,
  counter = true,
  serverError = null,
  validHint = 'Formato válido',
} = defineProps<Props>()

const model = defineModel<string>({ required: true })

const emit = defineEmits<{ 'focus-change': [focused: boolean] }>()

const focused = ref(false)
const hintId = computed(() => `${id}-hint`)

function setFocused(value: boolean): void {
  focused.value = value
  emit('focus-change', value)
}

const clientInvalid = computed(() => state.status.value === 'invalid')
const hasError = computed(() => !readonly && (clientInvalid.value || serverError !== null))
const showsValid = computed(() => state.status.value === 'valid' && !focused.value && validHint !== null)

const hint = computed(() => {
  if (readonly) return readonlyHint
  if (hasError.value) return clientInvalid.value ? state.result.value.message : serverError
  // While the field has focus the rule stays visible: the confirmation replaces the
  // guidance only once the user has left the field.
  if (showsValid.value) return validHint
  return rule
})

const hintTone = computed(() => {
  if (readonly) return 'muted'
  if (hasError.value) return 'error'
  if (showsValid.value) return 'success'
  return focused.value ? 'strong' : 'muted'
})

const counterTone = computed(() => {
  if (readonly) return 'faint'
  if (hasError.value) return 'error'
  if (model.value.length > 0) return 'strong'
  return focused.value ? 'muted' : 'faint'
})
</script>

<template>
  <div class="credential-field">
    <label class="label" :for="id" :class="{ muted: readonly }">{{ label }}</label>

    <BaseInput
      :id="id"
      v-model="model"
      :type="type"
      :revealable="revealable"
      :invalid="hasError"
      :readonly="readonly"
      :maxlength="enforceLimit ? state.maxLength : undefined"
      :autocomplete="autocomplete"
      :described-by="hintId"
      @focusin="setFocused(true)"
      @focusout="setFocused(false)"
    />

    <div class="hint-row">
      <span
        :id="hintId"
        class="hint body-sm"
        :class="`tone-${hintTone}`"
        :role="hasError ? 'alert' : undefined"
      >
        <span class="hint-long">{{ hint }}</span>
        <span class="hint-short">{{ hasError || !ruleShort ? hint : ruleShort }}</span>
      </span>
      <span v-if="counter" class="counter mono-sm" :class="`tone-${counterTone}`">
        {{ measure(model) }}/{{ state.maxLength }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.credential-field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.label {
  color: var(--ink-500);
}

.label.muted {
  color: var(--ink-300);
}

.hint-row {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
}

.counter {
  flex: none;
}

.hint-short {
  display: none;
}

.tone-error {
  color: var(--error);
}

.tone-success {
  color: var(--success);
}

.tone-strong {
  color: var(--ink-500);
}

.tone-muted {
  color: var(--ink-400);
}

.tone-faint {
  color: var(--ink-300);
}

.counter.tone-strong {
  color: var(--ink-700);
}

@media (width <= 639px) {
  .hint-row {
    gap: var(--sp-2);
  }

  .hint-long {
    display: none;
  }

  .hint-short {
    display: inline;
  }
}
</style>
