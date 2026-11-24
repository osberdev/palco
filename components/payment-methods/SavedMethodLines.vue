<script setup lang="ts">
import { savedMaskedNumber } from '../../server/domain/saved-payment'
import type { SavedPaymentMethodData } from '../../types'

interface Props {
  method: SavedPaymentMethodData
  /** RN-MET-08: the "Vencida" tag next to line 1. */
  expired?: boolean
  /** Only the masked number under line 1, without holder or expiry. */
  numberOnly?: boolean
  /** An expired method looks dimmed in the dialog, where it cannot be chosen. */
  dimmed?: boolean
}

const { method, expired = false, numberOnly = false, dimmed = false } = defineProps<Props>()

const masked = computed(() => (method.method === 'paypal' ? '' : savedMaskedNumber(method.last4)))
</script>

<template>
  <!-- The lines of a saved method. -->
  <div class="title-row">
    <span class="title" :class="{ muted: dimmed }">{{ savedMethodTitle(method) }}</span>
    <span v-if="expired" class="expired">Vencida</span>
  </div>
  <span v-if="method.method === 'paypal'" class="account">{{ method.email }}</span>
  <span v-else-if="numberOnly" class="number">{{ masked }}</span>
  <template v-else>
    <span class="detail"><span class="number">{{ masked }}</span> · {{ method.holder }}</span>
    <span class="due">Vence <span class="figure">{{ method.expiry }}</span></span>
  </template>
</template>

<style scoped>
.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.title {
  font: 500 var(--fs-15)/1.4 var(--font-sans);
  color: var(--ink-900);
}

/* An expired method looks dimmed in the dialog list. */
.title.muted {
  color: var(--ink-500);
}

/* A status tag, in the error red. */
.expired {
  flex: none;
  padding: var(--sp-1) calc(var(--sp-2) - 1px);
  border-radius: var(--r-xs);
  background: var(--error-subtle);
  color: var(--error);
  font: 500 var(--fs-12) var(--font-sans);
  letter-spacing: 0.04em;
}

.account {
  font: 400 var(--fs-14)/1.45 var(--font-sans);
  color: var(--ink-700);
  overflow-wrap: anywhere;
}

.detail {
  font: 400 var(--fs-14)/1.45 var(--font-sans);
  color: var(--ink-500);
}

.number {
  font: 400 var(--fs-14) var(--font-mono);
  color: var(--ink-700);
}

.due {
  font: 400 var(--fs-13) var(--font-sans);
  color: var(--ink-500);
}

.figure {
  font-family: var(--font-mono);
}
</style>
