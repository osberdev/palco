<script setup lang="ts">
import { useGateReading } from '../../composables/useGateReading'

interface Props {
  /** The page clock: the time of each scan and of a failure. */
  clock: () => Date
}

const { clock } = defineProps<Props>()

const emit = defineEmits<{
  /** 401: the gate closed on its own; the page returns to the venue list with this message. */
  closed: [message: string]
  /** 503: it is no longer configured; the page asks again. */
  unavailable: []
}>()

// The scans live in the page's memory: reloading clears them.
const { pending, last, rows, validate: send } = useGateReading(clock)

async function validate(code: string): Promise<void> {
  const outcome = await send(code)
  if (outcome?.kind === 'closed') emit('closed', outcome.message)
  else if (outcome?.kind === 'unavailable') emit('unavailable')
}

/** Without a camera, validation continues with the short code. */
function cameraUnavailable(): void {
  document.getElementById('gate-code')?.focus()
}
</script>

<template>
  <div class="reading-grid">
    <div class="reading-input">
      <GateCamera :busy="pending" @scan="validate" @unavailable="cameraUnavailable" />
      <GateCodeForm :pending="pending" :validate="validate" />
    </div>
    <div class="reading-results">
      <GateLastReading :reading="last" />
      <GateReadingList :rows="rows" />
    </div>
  </div>
</template>

<style scoped>
.reading-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-6);
  align-items: start;
}

.reading-input,
.reading-results {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
}

/* Narrower screens: one column, with the code before the results. */
@media (width <= 1023px) {
  .reading-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (width <= 639px) {
  .reading-grid {
    gap: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
