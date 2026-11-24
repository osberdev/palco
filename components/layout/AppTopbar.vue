<script setup lang="ts">
import { useSessionStore } from '../../stores/session'

const store = useSessionStore()
const { logout } = useAuth()

const pending = ref(false)

const menuOpen = ref(false)
const menuToggle = useTemplateRef<{ focus: () => void }>('menuToggle')

function toggleMenu(): void {
  if (menuOpen.value) closeMenu()
  else menuOpen.value = true
}

// Closing in any way returns focus to the button (RF-NAV-09).
function closeMenu(): void {
  menuOpen.value = false
  menuToggle.value?.focus()
}

async function onLogout(): Promise<void> {
  pending.value = true
  try {
    await logout()
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <header class="topbar">
    <NuxtLink to="/" class="brand" aria-label="PALCO, ir al inicio">
      <PalcoLogo :height="28" />
    </NuxtLink>

    <MainNavigation class="desktop-navigation" />

    <div class="account">
      <UserAvatar />
      <span class="username body-md">{{ store.user?.username }}</span>

      <button
        type="button"
        class="logout"
        :disabled="pending"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        @click="onLogout"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
          <path d="M11 12h9" />
          <path d="m16.5 8.5 4 3.5-4 3.5" />
        </svg>
      </button>

      <MenuToggle
        ref="menuToggle"
        class="menu-trigger"
        controls="mobile-menu"
        :open="menuOpen"
        @toggle="toggleMenu"
      />
    </div>

    <MobileMenu id="mobile-menu" :open="menuOpen" @close="closeMenu" />
  </header>
</template>

<style scoped>
/*
 * Its own stacking context: the bar and its panel stay above the menu layer,
 * which goes to the body.
 */
.topbar {
  position: relative;
  z-index: 3;
  flex: none;
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: 0 var(--sp-7);
  background: var(--white);
  border-bottom: var(--border);
}

.brand {
  display: flex;
  text-decoration: none;
}

.account {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}


.username {
  color: var(--ink-700);
}

.logout {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-500);
  transition:
    background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.logout:hover:not(:disabled) {
  background: var(--ink-100);
  color: var(--ink-900);
}

.logout:disabled {
  color: var(--ink-300);
  cursor: not-allowed;
}

/* More specific than MenuToggle's own style, which shows it. */
.account .menu-trigger {
  display: none;
}

/*
 * The navigation collapses into the menu button; avatar and sign-out stay in the
 * bar, with 44 px touch targets.
 */
@media (width <= 1023px) {
  .topbar {
    padding: 0 var(--sp-5);
  }

  .desktop-navigation,
  .username {
    display: none;
  }

  .account {
    gap: var(--sp-1);
  }

  .logout {
    width: 44px;
    height: 44px;
  }

  .account .menu-trigger {
    display: flex;
  }
}

@media (width <= 639px) {
  .topbar {
    padding: 0 var(--sp-3) 0 calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
