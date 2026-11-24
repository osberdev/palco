<script setup lang="ts">
interface Props {
  /** `bar`: the center of the bar at lg and xl. `menu`: the rows of the md and sm panel. */
  variant?: 'bar' | 'menu'
}

const { variant = 'bar' } = defineProps<Props>()

const route = useRoute()
const active = computed(() => activeDestination(route.path))

const firstLink = useTemplateRef<{ $el: HTMLElement }[]>('links')

/** The menu moves focus here when it opens (RF-NAV-09). */
function focusFirst(): void {
  firstLink.value?.[0]?.$el.focus()
}

defineExpose({ focusFirst })
</script>

<template>
  <nav class="main-navigation" :class="`variant-${variant}`" aria-label="Principal">
    <!--
      aria-current is explicit: NuxtLink only sets it on an exact match, and
      "Catálogo" is also active on /catalogo/* and /compra/*.
    -->
    <NuxtLink
      v-for="link in NAVIGATION_LINKS"
      ref="links"
      :key="link.destination"
      :to="link.to"
      class="link"
      :class="{ active: active === link.destination }"
      :aria-current="active === link.destination ? 'page' : undefined"
    >
      <span class="text">{{ link.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.main-navigation {
  display: flex;
}

.link {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: var(--ink-500);
  transition: color var(--dur-fast) var(--ease);
}

.link:hover {
  color: var(--ink-900);
}

.text {
  padding-bottom: 2px;
  border-bottom: 2px solid transparent;
}

.link.active {
  color: var(--ink-900);
  font-weight: 500;
}

.link.active .text {
  border-bottom-color: var(--ink-900);
}

/*
 * Geist 14. With four destinations the gap drops from 32 to 24 so the bar fits on
 * one line from 1024 without shortening the CURP; at xl it goes back to 32.
 */
.variant-bar {
  align-items: center;
  gap: var(--sp-5);
  font: 400 var(--fs-14)/1.5 var(--font-sans);
}

@media (width >= 1440px) {
  .variant-bar {
    gap: var(--sp-6);
  }
}

/* Rows 56 tall in Geist 16; the inactive one in --ink-700. */
.variant-menu {
  flex-direction: column;
  font: 400 var(--fs-16)/1.5 var(--font-sans);
}

.variant-menu .link {
  height: 56px;
  border-bottom: var(--border);
  color: var(--ink-700);
}

.variant-menu .link.active {
  color: var(--ink-900);
}
</style>
