<script setup lang="ts">
import type { TextSegment } from '../../utils/purchase-view'

interface Props {
  segments: readonly TextSegment[]
}

const { segments } = defineProps<Props>()
</script>

<template>
  <!--
    Text with figures in mono on the same line, separated by a space the way
    `segmentsText` reads it. The space goes outside the spans: inside a mono span it
    would take the mono width.
  -->
  <template v-for="(segment, index) in segments" :key="index">{{ index > 0 ? ' ' : '' }}<span :class="{ figure: segment.mono, muted: segment.muted }">{{ segment.text }}</span></template>
</template>

<style scoped>
.figure {
  font-family: var(--font-mono);
  white-space: nowrap;
}

.muted {
  font-family: var(--font-sans);
  color: var(--ink-500);
}
</style>
