<script setup lang="ts">
import type { EventSchedule } from '../../composables/useEventSchedule'

interface Props {
  schedule: EventSchedule
}

const { schedule } = defineProps<Props>()

// At the top level so the template unwraps them and `v-model` writes into the
// purchase state.
const { date, time, dateTouched, timeTouched, dateError, timeError, dateHelp, timeHelp } = schedule
</script>

<template>
  <!-- Date and time, shared by the three purchases. -->
  <div class="schedule">
    <FormField id="event-date" label="Fecha" :help="dateHelp" :error="dateError">
      <template #default="{ describedBy, invalid }">
        <BaseInput
          id="event-date"
          v-model="date"
          mono
          :invalid="invalid"
          :described-by="describedBy"
          autocomplete="off"
          @focusout="dateTouched = true"
        />
      </template>
    </FormField>

    <FormField id="event-time" label="Hora" :help="timeHelp" :error="timeError">
      <template #default="{ describedBy, invalid }">
        <BaseInput
          id="event-time"
          v-model="time"
          mono
          :invalid="invalid"
          :described-by="describedBy"
          autocomplete="off"
          @focusout="timeTouched = true"
        />
      </template>
    </FormField>
  </div>
</template>

<style scoped>
.schedule {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
}
</style>
