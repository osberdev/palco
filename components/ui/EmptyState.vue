<script setup lang="ts">
interface Props {
  title: string
  text: string
  /** The illustration URL, served from `public/`. */
  illustration: string
}

const { title, text, illustration } = defineProps<Props>()
</script>

<template>
  <!--
    The same card as ErrorState. Unlike ErrorState, the illustration is requested by
    URL from `public/`: this state never appears because of a network failure, so it
    does not need to be inlined in the bundle.
  -->
  <section class="empty-state">
    <!-- Decorative: the title already says what is happening. -->
    <img class="illustration" :src="illustration" alt="" width="200" height="200">
    <h2 class="display-md title">{{ title }}</h2>
    <p class="body-lg text">{{ text }}</p>
    <div v-if="$slots.action" class="action">
      <slot name="action" />
    </div>
  </section>
</template>

<style scoped>
.empty-state {
  /* The card's width and minimum height; not design tokens. */
  --empty-state-max-width: 628px;
  --empty-state-min-height: 520px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-5);
  width: 100%;
  max-width: var(--empty-state-max-width);
  min-height: var(--empty-state-min-height);
  margin-inline: auto;
  padding: var(--sp-8);
  background: var(--ink-50);
  border: var(--border);
  border-radius: var(--r-md);
  text-align: center;
}

/* multiply lets the illustration's paper square show through. */
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
  max-width: 400px;
  color: var(--ink-500);
}

/* sm: no minimum height and less padding. */
@media (width <= 639px) {
  .empty-state {
    min-height: 0;
    padding: var(--sp-7) var(--sp-5);
  }
}
</style>
