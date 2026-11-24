<script setup lang="ts">
import type { GateVenue } from '../types'

// The venue staff screen: no navigation bar and no buyer account. With the
// gate open, it shows the venue and "Cerrar taquilla".
// The page wraps itself in <NuxtLayout> and passes the venue down, so the bar
// comes from the same data as the page, also in the server HTML, which renders
// the layout before the page's async setup finishes.
interface Props {
  venue?: GateVenue | null
  closing?: boolean
}

const { venue = null, closing = false } = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="gate-shell">
    <header class="gate-topbar">
      <PalcoLogo :height="28" />
      <div v-if="venue" class="gate-venue">
        <span class="venue-name body-md">Taquilla · {{ venue.name }}</span>
        <button type="button" class="close-gate body-md" :disabled="closing" @click="emit('close')">Cerrar taquilla</button>
      </div>
    </header>

    <main class="main">
      <slot />
    </main>

    <AppFooter short />
  </div>
</template>

<style scoped>
.gate-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ink-50);
}

.gate-topbar {
  flex: none;
  min-height: var(--topbar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: 0 var(--sp-7);
  background: var(--white);
  border-bottom: var(--border);
}

.gate-venue {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}

.venue-name {
  color: var(--ink-900);
}

/* An underlined link, not a primary button: it is not the screen's main action. */
.close-gate {
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-900);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.close-gate:hover:not(:disabled) {
  color: var(--ink-700);
}

.close-gate:disabled {
  color: var(--ink-400);
  cursor: not-allowed;
}

.main {
  flex: 1;
  padding: var(--sp-9) var(--sp-7) var(--sp-8);
}

@media (width <= 1023px) {
  .gate-topbar {
    padding: 0 var(--sp-5);
  }

  .main {
    padding: var(--sp-6) var(--sp-5);
  }
}

/* Narrow screens: the brand and "Cerrar taquilla" on top; the venue on its own line. */
@media (width <= 639px) {
  .gate-topbar {
    flex-wrap: wrap;
    padding: var(--sp-4) calc(var(--sp-4) + var(--sp-1));
    row-gap: var(--sp-3);
  }

  .gate-venue {
    display: contents;
  }

  .close-gate {
    order: 1;
  }

  .venue-name {
    order: 2;
    flex-basis: 100%;
  }

  .main {
    padding: var(--sp-6) calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
