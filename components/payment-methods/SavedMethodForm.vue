<script setup lang="ts">
import type { AccountAlert } from '../../composables/useAccountRequest'
import type { PaymentFieldsState } from '../../composables/usePaymentFields'

interface Props {
  fields: PaymentFieldsState
  /** Without method and number (RN-MET-05). */
  editing?: boolean
  /** The note under the fields: the security code one or the number one. */
  note: string
  submitLabel: string
  /** "Guardando método", with the fields read-only. */
  savingLabel: string
  pending: boolean
  alert: AccountAlert | null
  canSubmit: boolean
}

const { fields, editing = false, note, submitLabel, savingLabel, pending, alert, canSubmit } = defineProps<Props>()

const emit = defineEmits<{ submit: [], cancel: [], signIn: [] }>()

const signedOut = computed(() => alert?.kind === 'unauthorized')
const retrying = computed(() => alert?.kind === 'offline' || alert?.kind === 'failed')
const label = computed(() => {
  if (signedOut.value) return 'Iniciar sesión'
  return retrying.value ? 'Reintentar' : submitLabel
})

function onPrimary(): void {
  if (signedOut.value) emit('signIn')
  else emit('submit')
}
</script>

<template>
  <!-- The form card, 640 wide at most. -->
  <form class="method-form" novalidate @submit.prevent="onPrimary">
    <slot name="summary" />
    <PaymentFields :fields="fields" :editing="editing" :locked="pending" />
    <p class="body-sm note">{{ note }}</p>

    <AccountFailureNotice v-if="alert" :alert="alert" failure-title="No pudimos guardar el método" />

    <div class="actions">
      <BaseButton type="submit" class="primary" :disabled="!signedOut && !canSubmit" :loading="pending" :loading-label="savingLabel">
        {{ label }}
      </BaseButton>
      <BaseButton variant="secondary" :disabled="pending" @click="emit('cancel')">Cancelar</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.method-form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-4) + var(--sp-1));
  width: 100%;
  max-width: 640px;
  padding: var(--sp-6);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.note {
  margin: 0;
  color: var(--ink-500);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

/* While saving, the button keeps its ink color. */
.primary.loading {
  background: var(--ink-900);
  color: var(--white);
}

@media (width <= 639px) {
  .method-form {
    max-width: none;
    padding: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
