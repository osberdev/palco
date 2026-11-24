<script setup lang="ts">
import { useSessionStore } from '../../stores/session'

/**
 * The side is set by `--avatar-size` and the letter by `--avatar-font`, not by a
 * prop: the profile circle is 144 at lg and md and 112 at sm, and a prop cannot
 * follow a media query in the server HTML. Without them, 32 and 12, the top bar's.
 */
interface Props {
  /** In the bar it links to the profile (RF-NAV-11); in the profile, it is just an image. */
  link?: boolean
  /**
   * Without a value, the saved photo. A URL shows the preview and `null` forces the
   * initials, like the "Quitar foto" preview.
   */
  preview?: string | null
}

const { link = true, preview = undefined } = defineProps<Props>()

const store = useSessionStore()

const source = computed<string | null>(() => {
  if (preview !== undefined) return preview
  const version = store.user?.photoVersion
  return version ? `/api/profile/photo?v=${encodeURIComponent(version)}` : null
})

// If the image does not load, the initials come back: a missing file degrades
// instead of breaking, like the photographs in public/img.
const failed = ref(false)
watch(source, () => {
  failed.value = false
})

const showImage = computed(() => source.value !== null && !failed.value)

// WCAG 2.5.3: with initials, the accessible name starts with the visible text
// ("AS, perfil"); with a photo there is no visible text and "Perfil" is enough.
const linkLabel = computed(() => avatarLinkLabel(showImage.value ? '' : store.initials))
</script>

<template>
  <NuxtLink v-if="link" to="/perfil" class="avatar" :aria-label="linkLabel">
    <img v-if="showImage" :src="source ?? undefined" alt="" class="photo" @error="failed = true">
    <span v-else aria-hidden="true">{{ store.initials }}</span>
  </NuxtLink>
  <div v-else class="avatar">
    <img v-if="showImage" :src="source ?? undefined" alt="Foto de perfil" class="photo" @error="failed = true">
    <span v-else aria-hidden="true">{{ store.initials }}</span>
  </div>
</template>

<style scoped>
.avatar {
  flex: none;
  width: var(--avatar-size, 32px);
  height: var(--avatar-size, 32px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border: var(--border);
  border-radius: var(--r-full);
  background: var(--ink-100);
  font-family: var(--font-sans);
  font-size: var(--avatar-font, var(--fs-12));
  font-weight: 500;
  color: var(--ink-700);
  text-decoration: none;
}

.photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
