<script setup lang="ts">
import { useSessionStore } from '../../stores/session'

interface Props {
  id: string
  open: boolean
}

const { id, open } = defineProps<Props>()

const emit = defineEmits<{ close: [] }>()

const store = useSessionStore()
const route = useRoute()
const navigation = useTemplateRef<{ focusFirst: () => void }>('navigation')

// A link to the current destination does not change the route, and the menu must close anyway.
function onNavigationClick(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest('a')) emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

// When switching to lg the button disappears and the menu would stay open with no
// way to close it, and scrolling locked.
let desktop: MediaQueryList | null = null
function onDesktopChange(event: MediaQueryListEvent): void {
  if (event.matches) emit('close')
}

watch(
  () => open,
  async (isOpen) => {
    if (!import.meta.client) return
    // The background does not scroll while the menu is open (RF-NAV-09).
    document.documentElement.classList.toggle('scroll-locked', isOpen)
    if (isOpen) {
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      navigation.value?.focusFirst()
    }
    else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

watch(() => route.fullPath, () => {
  if (open) emit('close')
})

onMounted(() => {
  desktop = window.matchMedia('(width >= 1024px)')
  desktop.addEventListener('change', onDesktopChange)
})

onBeforeUnmount(() => {
  desktop?.removeEventListener('change', onDesktopChange)
  document.removeEventListener('keydown', onKeydown)
  document.documentElement.classList.remove('scroll-locked')
})
</script>

<template>
  <!--
    The layer goes to the body so it sits below the bar, which has its own stacking
    context, and above the rest of the page.
  -->
  <Teleport to="body">
    <div v-if="open" class="menu-backdrop" aria-hidden="true" @click="emit('close')" />
  </Teleport>
  <div v-show="open" :id="id" class="mobile-menu">
    <MainNavigation ref="navigation" variant="menu" @click="onNavigationClick" />
    <!--
      RF-AUT-20: at md and sm the bar does not show the CURP, so the menu keeps it
      with the circle.
    -->
    <div class="account">
      <UserAvatar />
      <span class="body-md username">{{ store.user?.username }}</span>
    </div>
  </div>
</template>

<style scoped>
/*
 * No shadow: the panel is separated from the content by its border and the layer.
 * The account row keeps the CURP (RF-AUT-20).
 */
.mobile-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  padding: var(--sp-1) var(--sp-5) var(--sp-4);
  background: var(--white);
  border-bottom: var(--border);
}

.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2;

  /* rgba(23, 20, 18, .4): --ink-900 at 40 %, without a literal. */
  background: color-mix(in srgb, var(--ink-900) 40%, transparent);
}

.account {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding-top: var(--sp-4);
}

.username {
  color: var(--ink-700);
}

@media (width <= 639px) {
  .mobile-menu {
    padding-inline: calc(var(--sp-4) + var(--sp-1));
  }
}

@media (width >= 1024px) {
  .mobile-menu {
    display: none;
  }
}
</style>
