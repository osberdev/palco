<script setup lang="ts">
import type { Cents, Currency } from '../../types'

/** Amounts in cents. */
interface ServiceFee {
  /** Fee per ticket. */
  readonly perTicket: Cents
  readonly total: Cents
}

interface Props {
  quantity: number
  /** Section for theaters, format for cinemas. */
  unitName: string
  subtotal: Cents
  /** Cinemas only (RN-TAR-05); without it there is no fee line. */
  fee?: ServiceFee | null
  total: Cents
  currency: Currency
}

const { quantity, unitName, subtotal, fee = null, total, currency } = defineProps<Props>()
</script>

<template>
  <div class="order-summary">
    <div class="line">
      <span class="body-md"><span class="figure">{{ quantity }} ×</span> {{ unitName }}</span>
      <span class="mono-md">{{ formatMoney(subtotal, currency) }}</span>
    </div>
    <div v-if="fee" class="line">
      <span class="body-md">
        Cargo por servicio · <span class="figure">{{ quantity }} × {{ formatMoney(fee.perTicket, currency) }}</span>
      </span>
      <span class="mono-md">{{ formatMoney(fee.total, currency) }}</span>
    </div>
    <div class="total">
      <span class="heading-md">Total</span>
      <span class="amount">{{ formatMoney(total, currency) }}</span>
    </div>
  </div>
</template>

<style scoped>
.order-summary {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-top: var(--sp-5);
  border-top: var(--border);
}

.line,
.total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--sp-4);
}

.line {
  color: var(--ink-700);
}

/* An amount never breaks: "2 × MXN 6.00" wraps as a whole if it does not fit. */
.figure {
  font-family: var(--font-mono);
  white-space: nowrap;
}

.mono-md {
  text-align: right;
  white-space: nowrap;
}

.total {
  padding-top: var(--sp-3);
  border-top: var(--border);
  color: var(--ink-900);
}

.amount {
  font: 500 var(--fs-24) var(--font-mono);
  white-space: nowrap;
}
</style>
