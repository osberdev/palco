<script setup lang="ts">
import type { ReadingRow } from '../../utils/gate-reading'

defineProps<{ rows: readonly ReadingRow[] }>()
</script>

<template>
  <section class="readings" aria-labelledby="gate-readings-title">
    <h2 id="gate-readings-title" class="label">Últimas lecturas</h2>
    <div class="list">
      <p v-if="rows.length === 0" class="empty">—</p>
      <ol v-else>
        <li v-for="(row, index) in rows" :key="index" class="row">
          <span class="time">{{ row.time }}</span>
          <span class="title" :class="`tone-${row.tone}`">
            {{ row.title }}
            <span v-if="row.shortCode" class="code code-below">{{ row.shortCode }}</span>
          </span>
          <span class="code code-aside">{{ row.shortCode ?? '' }}</span>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.readings {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.label {
  margin: 0;
  font: 500 var(--fs-12) / 1.3 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-500);
}

.list {
  overflow: hidden;
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  margin: 0;
  padding: calc(var(--sp-3) + 2px) var(--sp-4);
  font: 400 var(--fs-14) var(--font-mono);
  color: var(--ink-300);
}

.row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-3) var(--sp-4);
}

.row + .row {
  border-top: 1px solid var(--ink-100);
}

.time {
  font: 400 var(--fs-13) var(--font-mono);
  color: var(--ink-700);
}

.title {
  font: 500 var(--fs-14) / 1.4 var(--font-sans);
}

.tone-success {
  color: var(--success);
}

.tone-error {
  color: var(--error);
}

.code {
  font: 400 var(--fs-12) var(--font-mono);
  color: var(--ink-500);
  white-space: nowrap;
}

.code-below {
  display: none;
}

/* Narrow screens: the code moves under the result, with no third column. */
@media (width <= 639px) {
  .row {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .code-below {
    display: block;
  }

  .code-aside {
    display: none;
  }
}
</style>
