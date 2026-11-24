<script setup lang="ts">
interface Props {
  id: string
  plays: readonly string[]
}

const { id, plays } = defineProps<Props>()

const model = defineModel<number>({ required: true })
</script>

<template>
  <div class="play-select">
    <select :id="id" v-model.number="model">
      <option v-for="(play, index) in plays" :key="play" :value="index">{{ play }}</option>
    </select>
    <svg
      class="chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </div>
</template>

<style scoped>
.play-select {
  position: relative;
}

select {
  width: 100%;
  height: 48px;
  padding: 0 var(--sp-7) 0 var(--sp-3);
  appearance: none;
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-sm);
  font: 400 var(--fs-16) var(--font-sans);
  color: var(--ink-900);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease);
}

select:hover {
  border-color: var(--ink-400);
}

select:focus-visible {
  outline: none;
  border-color: var(--ink-900);
  box-shadow: 0 0 0 3px var(--ink-100);
}

.chevron {
  position: absolute;
  top: 50%;
  right: var(--sp-3);
  transform: translateY(-50%);
  color: var(--ink-500);
  pointer-events: none;
}
</style>
