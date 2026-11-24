<template>
  <div class="auth-shell">
    <AuthBrandPanel />

    <main class="pane">
      <!--
        On small screens the brand panel disappears and the identity is shown here,
        on a light surface.
      -->
      <div class="compact-brand">
        <PalcoLogo :height="32" :with-wordmark="false" />
        <span class="wordmark">PALCO</span>
      </div>

      <div class="content">
        <slot />
      </div>

      <AppFooter compact />
    </main>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: flex;
  background: var(--ink-50);
}

.pane {
  flex: 1;
  min-width: 0;
  padding: calc(var(--sp-8) + var(--sp-2)) calc(var(--sp-9) + var(--sp-2));
  display: flex;
  flex-direction: column;
}

.content {
  margin: auto 0;
  width: 100%;
}

.compact-brand {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--sp-2) + 2px);
}

.compact-brand .wordmark {
  font: 600 var(--fs-13) var(--font-sans);
  letter-spacing: 0.14em;
  color: var(--ink-900);
}

@media (width <= 1023px) {
  .auth-shell {
    flex-direction: column;
  }

  .pane {
    padding: var(--sp-8) var(--sp-6);
  }

  .content {
    width: 400px;
    max-width: 100%;
    margin: auto;
  }
}

@media (width <= 639px) {
  .pane {
    padding: var(--sp-8) var(--sp-5) var(--sp-5);
  }

  .compact-brand {
    display: flex;
  }

  .content {
    width: 100%;
  }
}
</style>
