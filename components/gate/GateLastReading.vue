<script setup lang="ts">
import type { ReadingView } from '../../utils/gate-reading'

defineProps<{ reading: ReadingView | null }>()
</script>

<template>
  <!-- Each new scan is announced without moving focus from the code field (RNF-10). -->
  <div
    class="last-reading"
    :class="reading ? `tone-${reading.tone}` : 'idle'"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <span class="label">Última lectura</span>
    <span v-if="!reading" class="empty">—</span>
    <template v-else>
      <div class="result">
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path v-if="reading.tone === 'success'" d="m8.2 12.3 2.6 2.6 5-5.4" />
          <template v-else>
            <path d="M12 7.5v5.5" />
            <path d="M12 16.4v.2" />
          </template>
        </svg>
        <strong class="title">{{ reading.title }}</strong>
      </div>
      <span v-if="reading.detail" class="detail">{{ reading.detail }}</span>
      <span v-if="reading.trace" class="trace">{{ reading.trace }}</span>
    </template>
  </div>
</template>

<style scoped>
.last-reading {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: calc(var(--sp-5) + var(--sp-1));
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.last-reading.idle {
  gap: calc(var(--sp-2) + 2px);
}

.tone-success {
  color: var(--success);
  background: var(--success-subtle);
  border-color: var(--success);
}

.tone-error {
  color: var(--error);
  background: var(--error-subtle);
  border-color: var(--error);
}

.label {
  font: 500 var(--fs-12) / 1.3 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-500);
}

.tone-success .label,
.tone-error .label {
  color: inherit;
}

.empty {
  font: 500 var(--fs-32) var(--font-mono);
  color: var(--ink-300);
}

.result {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
}

.icon {
  flex: none;
  width: 32px;
  height: 32px;
}

.title {
  font: 600 var(--fs-32) / 1.15 var(--font-sans);
  text-wrap: balance;
}

.detail {
  font: 400 var(--fs-16) / 1.5 var(--font-mono);
}

.trace {
  font: 400 var(--fs-12) var(--font-mono);
}

@media (width <= 639px) {
  .last-reading:not(.idle) {
    padding: calc(var(--sp-4) + var(--sp-1));
  }

  .empty,
  .title {
    font-size: var(--fs-24);
  }

  .icon {
    width: 24px;
    height: 24px;
  }

  .detail {
    font-size: var(--fs-14);
  }
}
</style>
