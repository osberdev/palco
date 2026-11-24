<script setup lang="ts">
import type { ConfirmationAlert } from '../../composables/usePurchaseConfirmation'

interface Props {
  alert: ConfirmationAlert | null
  /** `evaluatePayment` returned OK. */
  canConfirm: boolean
  submitting: boolean
}

const { alert, canConfirm, submitting } = defineProps<Props>()

const emit = defineEmits<{ confirm: [], signIn: [] }>()

// Without a response, or with a server error, it is unknown whether the purchase
// was recorded: retrying does not duplicate it (RN-CON-07). With the session
// ended, the button leads to sign-in.
const signedOut = computed(() => alert?.kind === 'unauthorized')
const label = computed(() => {
  if (signedOut.value) return 'Iniciar sesión'
  return alert?.kind === 'offline' || alert?.kind === 'failed' ? 'Reintentar confirmación' : 'Confirmar compra'
})

// A tickets rejection is shown on step 1, not here.
const notice = computed(() => (alert && !(alert.kind === 'rejected' && alert.step === 'tickets') ? alert : null))

function submit(): void {
  if (signedOut.value) emit('signIn')
  else emit('confirm')
}
</script>

<template>
  <!--
    The alert sits above the button, like "Usuario o contraseña incorrectos" on
    sign-in.
  -->
  <ConfirmationNotice v-if="notice" :alert="notice" />

  <!--
    Disabled while the payment is not OK, like "Continuar al pago". While
    confirming, "Confirmando compra" with `aria-busy`, and a second click sends
    nothing because the button is disabled.
  -->
  <BaseButton
    class="confirm"
    block
    :disabled="!signedOut && !canConfirm"
    :loading="submitting"
    loading-label="Confirmando compra"
    @click="submit"
  >
    {{ label }}
  </BaseButton>
</template>

<style scoped>
/*
 * While confirming, the button keeps its ink color; it is not dimmed but busy,
 * announced by `aria-busy` and the label.
 */
.confirm.loading {
  background: var(--ink-900);
  color: var(--white);
}
</style>
