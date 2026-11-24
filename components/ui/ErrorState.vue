<script setup lang="ts">
// Inlined at build time: the error state cannot depend on the network to show.
// `?inline` does not depend on assetsInlineLimit.
import defaultIllustration from '~/assets/img/estado-error.jpg?inline'

interface Props {
  /** The default title is the catalog's; the purchase passes its own. */
  title?: string
  /** HTTP status of the failure; 0 if there was no response. */
  status: number
  /**
   * Time of the failure, HH:MM:SS. It arrives as a prop rather than being read from
   * the clock here: same criterion as `HomeGreeting`, the component stays
   * deterministic.
   */
  time: string
  /** Illustration URL; the inlined error illustration by default. */
  illustration?: string
  /** Paragraph under the title; the catalog's by default. Other screens pass their own. */
  message?: string
  /** The failure was the request timeout. */
  timedOut?: boolean
}

const {
  title = 'No pudimos cargar el catálogo',
  status,
  time,
  illustration = defaultIllustration,
  message = 'El servicio de recintos no respondió a tiempo. Tu sesión sigue activa y no se registró ningún cargo.',
  timedOut = false,
} = defineProps<Props>()

const emit = defineEmits<{ retry: [] }>()

const reason = computed(() => failureTrace(status, timedOut))
</script>

<template>
  <div class="error-state" role="alert">
    <!-- Decorative: the title already says what happened. -->
    <img class="illustration" :src="illustration" alt="" width="200" height="200">
    <h2 class="display-md title">{{ title }}</h2>
    <p class="body-lg text">{{ message }}</p>
    <div class="actions">
      <BaseButton class="retry" @click="emit('retry')">Reintentar</BaseButton>
      <p class="trace">{{ reason }} · {{ time }}</p>
    </div>
  </div>
</template>

<style scoped>
.error-state {
  /* The card width; not a design token. */
  --error-state-max-width: 628px;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-5);
  width: 100%;
  max-width: var(--error-state-max-width);
  margin-inline: auto;
  padding: var(--sp-8);
  background: var(--ink-50);
  border: var(--border);
  border-radius: var(--r-md);
  text-align: center;
}

/*
 * multiply keeps the illustration's paper square visible, darker than the card.
 * It does not blend it away.
 */
.illustration {
  width: 200px;
  height: 200px;
  object-fit: cover;
  mix-blend-mode: multiply;
}

/* display-md without the italic: the title is upright. */
.title {
  font-style: normal;
  color: var(--ink-900);
}

/* Geist 15/1.6 is outside the type scale; body-lg is the closest. */
.text {
  max-width: 420px;
  color: var(--ink-500);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
}

/* A compact button: 44 tall, 20 of padding and Geist 14/500, versus BaseButton's 48 and 15. */
.retry {
  height: 44px;
  padding: 0 calc(var(--sp-4) + var(--sp-1));
  font-size: var(--fs-14);
}

/* Mono 13: between mono-sm (12) and mono-md (14). */
.trace {
  font: 400 var(--fs-13) var(--font-mono);
  color: var(--ink-400);
}

@media (width <= 639px) {
  .error-state {
    padding: var(--sp-6) var(--sp-4);
  }
}
</style>
