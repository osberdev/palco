<script setup lang="ts">
import type { CinemaPurchaseState } from '../../composables/useCinemaPurchase'
import { CINEMA_FORMAT_NAMES } from '../../utils/cinema'

interface Props {
  purchase: CinemaPurchaseState
}

const { purchase } = defineProps<Props>()

const emit = defineEmits<{ continue: [] }>()

// The composable's refs are lifted to the top level so the template unwraps them
// and `v-model` writes into the purchase state.
const {
  schedule,
  cinema,
  detail,
  filmIndex,
  filmError,
  age,
  ageTouched,
  ageError,
  ageHelp,
  formatId,
  format,
  formatError,
  quantity,
  quantityError,
  seats,
  seatsTouched,
  seatErrors,
  selection,
} = purchase

const filmsHelp = computed(() => {
  const count = cinema.value.films.length
  return `${count} ${count === 1 ? 'película' : 'películas'} en cartelera`
})

const seatsHelp = computed(() =>
  format.value
    ? `La sala ${CINEMA_FORMAT_NAMES[format.value.id]} cuenta con ${format.value.seats} butacas. Rango válido: 1 a ${format.value.seats}`
    : `Elige un formato que opere ${cinema.value.name} para capturar los asientos.`,
)

function touchSeat(index: number): void {
  seatsTouched.value = seatsTouched.value.map((touched, current) => touched || current === index)
}
</script>

<template>
  <section class="tickets-card" aria-label="Boletos">
    <FormField id="film" label="Película" :help="filmsHelp" :error="filmError">
      <FilmSelect id="film" v-model="filmIndex" :films="cinema.films" />
    </FormField>

    <FormField id="attendee-age" class="age" label="Edad del asistente" :help="ageHelp" :error="ageError">
      <template #default="{ describedBy, invalid }">
        <BaseInput
          id="attendee-age"
          v-model="age"
          mono
          inputmode="numeric"
          autocomplete="off"
          :invalid="invalid"
          :described-by="describedBy"
          @focusout="ageTouched = true"
        />
      </template>
    </FormField>

    <FormatPicker
      v-model="formatId"
      :formats="cinema.formats"
      :chain="cinema.name"
      :currency="cinema.currency"
      :error="formatError"
    />

    <EventScheduleFields :schedule="schedule" />

    <QuantityField
      v-model="quantity"
      :user-limit="detail.userLimit"
      :available="detail.available"
      :error="quantityError"
    />

    <SeatFields v-model="seats" :errors="seatErrors" :help="seatsHelp" :disabled="!format" @touch="touchSeat" />

    <OrderSummary
      v-if="selection.ok"
      :quantity="selection.quote.quantity"
      :unit-name="CINEMA_FORMAT_NAMES[selection.quote.format.id]"
      :subtotal="selection.quote.subtotal"
      :fee="{ perTicket: selection.quote.serviceFee, total: selection.quote.feeTotal }"
      :total="selection.quote.amount"
      :currency="cinema.currency"
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

/* The age takes half a row. A fixed width, not a design token. */
.age {
  max-width: 280px;
}

/* The same separator as the summary, so the total appears in its place. */
.pending {
  padding-top: calc(var(--sp-4) + var(--sp-1));
  border-top: var(--border);
  color: var(--ink-500);
}

/* sm: 20 of padding and the age at full width. */
@media (width <= 639px) {
  .tickets-card {
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .age {
    max-width: none;
  }
}
</style>
