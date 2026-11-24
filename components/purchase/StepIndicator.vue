<script setup lang="ts">
interface Props {
  step: 'tickets' | 'payment'
}

const { step } = defineProps<Props>()

const number = computed(() => (step === 'tickets' ? 1 : 2))
const name = computed(() => (step === 'tickets' ? 'Boletos' : 'Pago'))
</script>

<template>
  <!-- Two bars and the step as text. The bars are decorative. -->
  <div class="step-indicator">
    <div class="bars" aria-hidden="true">
      <span class="bar done" />
      <span class="bar" :class="{ done: number === 2 }" />
    </div>
    <span class="step">Paso {{ number }} de 2 · {{ name }}</span>
  </div>
</template>

<style scoped>
/* 220 wide; not a design token. */
.step-indicator {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  width: 220px;
}

.bars {
  display: flex;
  gap: var(--sp-1);
}

.bar {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--ink-200);
}

.bar.done {
  background: var(--ink-900);
}

.step {
  font: 500 var(--fs-13) var(--font-sans);
  color: var(--ink-700);
}
</style>
