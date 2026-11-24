<script setup lang="ts">
import type { CalendarDate, MuseumDetail, SummaryRow } from '../../types'

interface Props {
  detail: MuseumDetail
  /** Today, read on the page and read again after a server rejection. */
  today: CalendarDate
  /** The page clock, for the time of failures. */
  clock: () => Date
  /** Reads `today` again and refetches the venue detail. */
  refreshContext: () => Promise<void>
}

const props = defineProps<Props>()

// Both composables live here rather than in each step: going back and forth keeps
// what was entered in both. They share the server's per-field messages after a
// confirmation rejection.
const serverErrors = useServerFieldErrors()
const purchase = useMuseumPurchase(() => props.detail, () => props.today, serverErrors)
const payment = usePayment(() => props.today, serverErrors)

const quote = computed(() => (purchase.selection.value.ok ? purchase.selection.value.quote : null))

// The guard that returns to step 1 without a quote is unreachable today: step 2
// does not edit the purchase.
const { step, stepChanged, goTo } = useCheckoutSteps(quote)

const { status, alert, confirm, dismissAlert, signInAgain } = usePurchaseConfirmation({
  venueId: () => props.detail.venue.id,
  selection: () => ({ tickets: { category: 'museo', input: purchase.input.value }, payment: payment.body.value }),
  clock: () => props.clock(),
  refreshContext: () => props.refreshContext(),
  serverErrors,
  onTicketsRejected: () => goTo('tickets'),
  onSavedMethodRejected: (code) => payment.rejectSavedMethod(code),
})

// The tickets rejection alert is cleared when continuing to payment again.
function continueToPayment(): void {
  dismissAlert()
  goTo('payment')
}

// The Met says "Tarifa general", like its summary.
const fee = computed(() => (quote.value?.feeKind === 'resident' ? 'Tarifa residente' : 'Tarifa general'))

// Venue, fee, date and time, and tickets.
const rows = computed<readonly SummaryRow[]>(() =>
  quote.value
    ? [
        { label: 'Recinto', value: props.detail.venue.name },
        { label: 'Tarifa', value: fee.value },
        { label: 'Fecha y hora', value: formatEventDate(quote.value.date, quote.value.time), mono: true },
        { label: 'Boletos', value: String(quote.value.quantity), mono: true },
      ]
    : [],
)
</script>

<template>
  <PaymentStep
    v-if="step === 'payment' && quote"
    :venue="detail.venue"
    :available="detail.available"
    :subtitle="`${detail.venue.name} · ${fee}`"
    :rows="rows"
    :total="quote.amount"
    :payment="payment"
    :submitting="status === 'submitting'"
    :alert="alert"
    @back="goTo('tickets')"
    @confirm="confirm"
    @sign-in="signInAgain"
  />
  <!--
    No closing day or today's hours in the panel: they would repeat the date and
    time hints.
  -->
  <CheckoutLayout
    v-else
    :title="detail.venue.name"
    :subtitle="`${detail.venue.city} · ${detail.venue.currency}`"
    step="tickets"
    :back-to="`/catalogo/${detail.venue.category}`"
    :back-label="categoryTitle(detail.venue.category)"
    :venue="detail.venue"
    :available="detail.available"
    :focus-on-mount="stepChanged"
  >
    <template v-if="alert?.kind === 'rejected' && alert.step === 'tickets'" #notice>
      <ConfirmationNotice :alert="alert" />
    </template>
    <MuseumTicketsCard :purchase="purchase" @continue="continueToPayment" />
  </CheckoutLayout>
</template>
