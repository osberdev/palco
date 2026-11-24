<script setup lang="ts">
import type { PaymentState } from '../../composables/usePayment'
import type { ConfirmationAlert } from '../../composables/usePurchaseConfirmation'
import type { Cents, SummaryRow, VenueBase } from '../../types'

interface Props {
  venue: VenueBase
  available: number
  /** `{venue} · {event}`, such as "Cinépolis · Insidious · VIP". */
  subtitle: string
  /** The purchase rows, without the payment one, which is added here. */
  rows: readonly SummaryRow[]
  /** In cents. */
  total: Cents
  payment: PaymentState
  /** Confirming; everything stays locked until the response. */
  submitting?: boolean
  alert?: ConfirmationAlert | null
}

const { venue, available, subtitle, rows, total, payment, submitting = false, alert = null } = defineProps<Props>()

const emit = defineEmits<{ back: [], confirm: [], signIn: [] }>()

// Only lives in step 2: when going back to step 1, the page gets its title back.
useHead({ title: () => `Pago · ${venue.name} · PALCO` })

// Without a valid payment there is no payment row. With a card, the masked number
// and the brand; with PayPal, the account.
const summaryRows = computed<readonly SummaryRow[]>(() => {
  const selection = payment.payment.value
  if (!selection.ok) return rows
  const paid = selection.payment
  const paymentRow: SummaryRow = paid.method === 'paypal'
    ? { label: 'Cuenta', value: paid.email }
    : { label: 'Tarjeta', value: formatCardSummary(paid.maskedNumber, paid.brand), mono: true }
  return [...rows, paymentRow]
})
</script>

<template>
  <CheckoutLayout
    title="Pago"
    :subtitle="subtitle"
    step="payment"
    back-label="Boletos"
    :venue="venue"
    :available="available"
    aside-width="summary"
    focus-on-mount
    :back-disabled="submitting"
    @back="emit('back')"
  >
    <template #aside>
      <PurchaseSummary :rows="summaryRows" :total="total" :currency="venue.currency" :category="venue.category" />
    </template>

    <PaymentCard
      :payment="payment"
      :locked="submitting"
      :alert="alert"
      @confirm="emit('confirm')"
      @sign-in="emit('signIn')"
    />
  </CheckoutLayout>
</template>
