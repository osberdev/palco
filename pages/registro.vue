<script setup lang="ts">
// Registration. The page is the only one that reads the clock: `today` decides the
// minimum age (RN-REG-04) and lives in `useState` so server and client hydrate
// with the same date.
definePageMeta({ layout: 'auth' })

useHead({ title: 'Crear cuenta · PALCO' })

function clock(): Date {
  return new Date()
}
const today = useState('registration-today', () => toCalendarDate(clock()))

const registration = useRegistration(today, clock)
</script>

<template>
  <RegistrationForm :registration="registration" />
</template>
