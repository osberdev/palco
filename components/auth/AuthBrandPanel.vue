<script setup lang="ts">
// The ambient image is decorative and goes in as a `background-image`, which emits
// no error event: the panel's ink background stays underneath permanently and
// covers any load failure without breaking the composition.
const ambient = '/img/login-ambient.jpg'
</script>

<template>
  <aside class="brand-panel">
    <div class="ambient" :style="{ backgroundImage: `url(${ambient})` }" aria-hidden="true" />

    <div class="top">
      <PalcoLogo tone="light" :height="29" />
    </div>

    <div class="bottom">
      <p class="tagline">Acceso a la cultura del mundo</p>
      <p class="facts">
        12 recintos · 7 países<br>
        Teatro · Cine · Museo
      </p>
    </div>
  </aside>
</template>

<style scoped>
.brand-panel {
  position: relative;
  flex: none;
  width: 560px;
  padding: var(--sp-8);
  background: var(--ink-900);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.ambient {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  opacity: 0.9;
}

.top,
.bottom {
  position: relative;
}

.bottom {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.tagline {
  font: italic 400 var(--fs-36)/1.15 var(--font-display);
  color: var(--ink-50);
}

.facts {
  font: 400 var(--fs-13)/1.7 var(--font-mono);
  color: var(--ink-300);
}

/* md: the side panel becomes a top band with the brand centered. */
@media (width <= 1023px) {
  .brand-panel {
    width: auto;
    height: 160px;
    padding: 0;
    align-items: center;
    justify-content: center;
  }

  .ambient {
    opacity: 0.55;
  }

  .bottom {
    display: none;
  }
}

/* sm: it disappears; the layout places the brand on a light background. */
@media (width <= 639px) {
  .brand-panel {
    display: none;
  }
}
</style>
