<script setup lang="ts">
import { ageOn, birthDateFromCurp } from '../server/domain/profile'
import { useSessionStore } from '../stores/session'
import type { TextSegment } from '../utils/purchase-view'

// Profile (RF-PER-01 and 02): the photo and the account data.
useHead({ title: 'Perfil · PALCO' })

// The clock is only read on the page, as in the purchase: `today` goes down to the
// domain and the photo card receives `clock` for the time of failures. It lives in
// `useState` so server and client hydrate with the same date.
function clock(): Date {
  return new Date()
}
const today = useState('profile-today', () => toCalendarDate(clock()))

const store = useSessionStore()
const curp = computed(() => store.user?.username ?? '')

// The date and the age come from the CURP through the domain (RF-PER-03); the page
// requests nothing from the server. With the seeded CURPs the rejection is
// unreachable, and then both rows say "—".
const birth = computed(() => birthDateFromCurp(curp.value))
const age = computed(() => (birth.value.ok ? ageOn(birth.value.value, today.value) : null))

// Figures in mono within the same line.
const figures = (text: string): TextSegment[] =>
  text.split(' ').map((word) => ({ text: word, mono: /^[0-9]+$/.test(word) }))

const birthSegments = computed(() => (birth.value.ok ? figures(formatLongDate(birth.value.value)) : null))
const ageSegments = computed(() => (age.value?.ok ? figures(formatAge(age.value.value)) : null))
</script>

<template>
  <div class="profile">
    <h1 class="display-lg">Perfil</h1>

    <div class="profile-grid">
      <ProfilePhotoCard :clock="clock" />

      <div class="account">
        <section class="account-card" aria-labelledby="account-title">
          <h2 id="account-title" class="heading-md">Datos de la cuenta</h2>
          <dl class="rows">
            <div class="row">
              <dt class="label">Nombre</dt>
              <dd class="value">{{ store.user?.displayName }}</dd>
            </div>
            <div class="row">
              <dt class="label">CURP</dt>
              <dd class="value mono">{{ curp }}</dd>
            </div>
            <div class="row">
              <dt class="label">Fecha de nacimiento</dt>
              <dd class="value">
                <SegmentedText v-if="birthSegments" :segments="birthSegments" />
                <template v-else>—</template>
              </dd>
            </div>
            <div class="row">
              <dt class="label">Edad</dt>
              <dd class="value">
                <SegmentedText v-if="ageSegments" :segments="ageSegments" />
                <template v-else>—</template>
              </dd>
            </div>
          </dl>
        </section>
        <p class="body-sm note">
          La fecha de nacimiento y la edad se obtienen de tu CURP. Estos datos no se pueden cambiar.
        </p>
      </div>
    </div>

    <WhatsappCard :clock="clock" />
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp-5) + var(--sp-1));
}

.display-lg {
  margin: 0;
}

/* Two columns from lg, one at md and sm. */
.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-5);
  align-items: start;
}

.account {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-width: 0;
}

.account-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-6);
  background: var(--white);
  border: var(--border);
  border-radius: var(--r-md);
}

.heading-md {
  margin: 0;
}

.rows {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.row {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: calc(var(--sp-3) + 2px) 0;
  border-top: 1px solid var(--ink-100);
}

.label {
  color: var(--ink-500);
}

.value {
  margin: 0;
  font: 400 var(--fs-16)/1.4 var(--font-sans);
  color: var(--ink-900);
  overflow-wrap: anywhere;
}

.value.mono {
  font-family: var(--font-mono);
}

.note {
  margin: 0;
  color: var(--ink-500);
}

@media (width <= 1023px) {
  .profile-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (width <= 639px) {
  .profile {
    gap: calc(var(--sp-4) + var(--sp-1));
  }

  .account-card {
    padding: calc(var(--sp-4) + var(--sp-1));
  }
}
</style>
