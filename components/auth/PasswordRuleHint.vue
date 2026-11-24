<script setup lang="ts">
import { isDigit, isLowercase, isSpecial, isUppercase } from '../../server/domain/credentials'

interface Props {
  /** The field's current value; the hint checks each requirement against it. */
  value: string
}

const { value } = defineProps<Props>()

interface Requirement {
  readonly detail: string
  readonly detailShort: string
  readonly test: (ch: string) => boolean
}

/**
 * The four mandatory requirements of RF-AUT-05. The symbol may go in any position,
 * so what needs to be communicated is not where it may go but that it must be there.
 *
 * Each predicate is the domain's own, not a copy: the hint cannot drift from the
 * function that validates the field.
 */
const REQUIREMENTS: readonly Requirement[] = [
  { detail: 'Al menos una mayúscula', detailShort: 'Mayúscula', test: isUppercase },
  { detail: 'Al menos una minúscula', detailShort: 'Minúscula', test: isLowercase },
  { detail: 'Al menos un número', detailShort: 'Número', test: isDigit },
  { detail: 'Al menos un símbolo', detailShort: 'Símbolo', test: isSpecial },
]

const requirements = computed(() =>
  REQUIREMENTS.map((requirement) => ({
    ...requirement,
    // An untouched field is not marked red: the requirement is not violated yet, only
    // pending. It is the same distinction as the 'pristine' state.
    met: value.length > 0 && [...value].some(requirement.test),
    pending: value.length === 0,
  })),
)
</script>

<template>
  <div class="rule-hint">
    <span class="label">La contraseña debe incluir</span>
    <div
      v-for="requirement in requirements"
      :key="requirement.detail"
      class="example"
      :class="{ pending: requirement.pending }"
    >
      <svg
        v-if="requirement.met"
        class="icon valid"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m5 12.8 4 4 10-10.4" />
      </svg>
      <svg
        v-else-if="requirement.pending"
        class="icon waiting"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M7 12h10" />
      </svg>
      <svg
        v-else
        class="icon invalid"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M6.5 6.5l11 11" />
        <path d="M17.5 6.5l-11 11" />
      </svg>
      <span class="detail detail-long">{{ requirement.detail }}</span>
      <span class="detail detail-short">{{ requirement.detailShort }}</span>
    </div>
  </div>
</template>

<style scoped>
.rule-hint {
  margin-top: var(--sp-1);
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-2) + 2px);
  padding: calc(var(--sp-3) + 2px) var(--sp-4);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-sm);
}

.label {
  color: var(--ink-500);
}

.example {
  display: flex;
  align-items: center;
  gap: calc(var(--sp-2) + 2px);
}

.icon {
  flex: none;
}

.icon.valid {
  color: var(--success);
}

.icon.invalid {
  color: var(--error);
}

.icon.waiting {
  color: var(--ink-300);
}

.detail {
  font: 400 var(--fs-12)/1.5 var(--font-sans);
  color: var(--ink-700);
}

.example.pending .detail {
  color: var(--ink-500);
}

.detail-short {
  display: none;
}

@media (width <= 1023px) {
  .detail-long {
    display: none;
  }

  .detail-short {
    display: inline;
  }
}
</style>
