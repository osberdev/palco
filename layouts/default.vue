<script setup lang="ts">
const route = useRoute()
const fullBleed = computed(() => route.meta.fullBleed === true)
</script>

<template>
  <div class="app-shell">
    <AppTopbar />

    <main v-if="fullBleed" class="main full-bleed">
      <slot />
    </main>
    <main v-else class="main">
      <div class="container">
        <slot />
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ink-50);
}

.main {
  flex: 1;
  padding: var(--sp-8) var(--sp-7);
}

.main.full-bleed {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.container {
  width: 100%;
  max-width: var(--container);
  margin: 0 auto;
}

@media (width <= 1023px) {
  .main {
    padding: var(--sp-6) var(--sp-5);
  }
}

@media (width <= 639px) {
  .main {
    padding: var(--sp-6) calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
