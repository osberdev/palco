<script setup lang="ts">
import type { TheaterPurchaseState } from '../../composables/useTheaterPurchase'

interface Props {
  purchase: TheaterPurchaseState
}

const { purchase } = defineProps<Props>()

const emit = defineEmits<{ continue: [] }>()

// The composable's refs are lifted to the top level so the template unwraps them
// and `v-model` writes into the purchase state.
const { theater, detail, playIndex, playError, sectionIndex, quantity, quantityError, selection } = purchase

const playsHelp = computed(() => {
  const count = theater.value.plays.length
  return `${count} ${count === 1 ? 'obra' : 'obras'} en temporada`
})
</script>

<template>
  <!-- The card starts directly with the play, without a header. -->
  <section class="tickets-card" aria-label="Boletos">
    <FormField id="play" label="Obra" :help="playsHelp" :error="playError">
      <PlaySelect id="play" v-model="playIndex" :plays="theater.plays" />
    </FormField>

    <SectionRadioGroup v-model="sectionIndex" name="section" :sections="theater.sections" :currency="theater.currency" />

    <EventScheduleFields :schedule="purchase" />

    <QuantityField
      v-model="quantity"
      :user-limit="detail.userLimit"
      :available="detail.available"
      :error="quantityError"
    />

    <OrderSummary
      v-if="selection.ok"
      :quantity="selection.quote.quantity"
      :unit-name="selection.quote.section.name"
      :subtotal="selection.quote.amount"
      :total="selection.quote.amount"
      :currency="theater.currency"
    />
    <p v-else class="body-md pending">El total aparece cuando todos los campos son válidos.</p>

    <!-- Disabled until the composite returns OK. -->
    <BaseButton block :disabled="!selection.ok" @click="emit('continue')">Continuar al pago</BaseButton>
  </section>
</template>

<style scoped>
.tickets-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
  padding: var(--sp-6);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

/* The same separator as the summary, so the total appears in its place. */
.pending {
  padding-top: calc(var(--sp-4) + var(--sp-1));
  border-top: var(--border);
  color: var(--ink-500);
}

/* sm: 20 of padding on the card. */
@media (width <= 639px) {
  .tickets-card {
    padding: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
