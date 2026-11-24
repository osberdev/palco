<script setup lang="ts">
interface Props {
  /** In the sign-in shell the footer has no strip and no border. */
  compact?: boolean
  /** The short text at every width: the gate screen. */
  short?: boolean
}

const { compact = false, short = false } = defineProps<Props>()
</script>

<template>
  <footer class="app-footer body-sm" :class="{ compact }">
    <span v-if="short">PALCO · CUT UdeG 2026</span>
    <template v-else>
      <span class="full">PALCO · Sistema TicketMaster · Pruebas de Software · CUT UdeG 2026</span>
      <span class="medium">PALCO · Sistema TicketMaster · CUT UdeG 2026</span>
      <span class="short">PALCO · CUT UdeG 2026</span>
    </template>
  </footer>
</template>

<style scoped>
.app-footer {
  flex: none;
  height: var(--footer-h);
  display: flex;
  align-items: center;
  padding: 0 var(--sp-7);
  background: var(--ink-50);
  border-top: var(--border);
  /* --ink-500 rather than --ink-400: 5.43:1 on --ink-50 versus 3.39:1 (RNF-08). */
  color: var(--ink-500);
}

.compact {
  height: auto;
  padding: 0;
  background: transparent;
  border-top: none;
}

.medium,
.short {
  display: none;
}

@media (width <= 1023px) {
  .app-footer {
    padding: 0 var(--sp-6);
  }

  .full {
    display: none;
  }

  .medium {
    display: inline;
  }
}

@media (width <= 639px) {
  .app-footer {
    padding: 0 var(--sp-5);
    text-align: center;
  }

  .compact {
    padding: 0;
    justify-content: center;
  }

  .medium {
    display: none;
  }

  .short {
    display: inline;
  }
}
</style>
