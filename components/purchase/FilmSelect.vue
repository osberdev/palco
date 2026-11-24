<script setup lang="ts">
import type { CinemaFilm } from '../../types'

interface Props {
  id: string
  films: readonly CinemaFilm[]
}

const { id, films } = defineProps<Props>()

const model = defineModel<number>({ required: true })

// The design right-aligns the classification and the duration inside the control,
// which an <option> does not allow: they go in the option text.
const labels = computed(() =>
  films.map((film) => `${film.title} · ${film.classification} · ${film.durationMinutes} min`),
)
</script>

<template>
  <PlaySelect :id="id" v-model="model" :plays="labels" />
</template>
