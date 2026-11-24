<script setup lang="ts">
import type { Cents, VenueBase } from '../../types'

interface Props {
  title: string
  subtitle: string
  step: 'tickets' | 'payment'
  /** Where going back leads. Without it, going back emits `back` (step 2). */
  backTo?: string
  backLabel: string
  /** For the venue panel, the default content of the `aside` slot. */
  venue: VenueBase
  available: number
  /** Service fee per ticket, in cents; cinemas only. */
  serviceFee?: Cents | null
  /** 360 for the venue panel; 400 for the payment summary. */
  asideWidth?: 'venue' | 'summary'
  /** After a step change focus goes to the title: the route does not change. */
  focusOnMount?: boolean
  /** Going back from step 2 is blocked while confirming. */
  backDisabled?: boolean
}

const {
  title,
  subtitle,
  step,
  backTo,
  backLabel,
  venue,
  available,
  serviceFee = null,
  asideWidth = 'venue',
  focusOnMount = false,
  backDisabled = false,
} = defineProps<Props>()

const emit = defineEmits<{ back: [] }>()

const heading = useTemplateRef<HTMLHeadingElement>('heading')

onMounted(() => {
  if (focusOnMount) heading.value?.focus({ preventScroll: true })
})
</script>

<template>
  <!--
    The shared purchase layout: a header with the step, a side panel via slot and
    the step card via slot.
  -->
  <div class="checkout" :class="`aside-${asideWidth}`">
    <header class="heading">
      <div class="titles">
        <BackLink :to="backTo" :label="backLabel" :disabled="backDisabled" @back="emit('back')" />
        <h1 ref="heading" class="display-lg title" tabindex="-1">{{ title }}</h1>
        <p class="body-md subtitle">{{ subtitle }}</p>
      </div>
      <StepIndicator :step="step" />
    </header>

    <div class="aside">
      <slot name="aside">
        <VenueAside
          :name="venue.name"
          :category="venue.category"
          :capacity="venue.capacity"
          :available="available"
          :currency="venue.currency"
          :service-fee="serviceFee"
        />
      </slot>
    </div>

    <div class="form">
      <!-- The rejection alert, under the step indicator. -->
      <div v-if="$slots.notice" class="notice">
        <slot name="notice" />
      </div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
/*
 * The left column never exceeds the container minus the band, so the form does
 * not stretch at xl. The band is 360 with the venue and 400 with the payment
 * summary; these are not design tokens.
 */
.checkout {
  --aside-width: 360px;
  --column-max-width: calc(var(--container) - var(--aside-width));

  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--aside-width);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'heading aside'
    'form aside';
}

.heading,
.form {
  justify-self: center;
  width: calc(100% - 2 * var(--sp-8));
  max-width: var(--column-max-width);
}

.checkout.aside-summary {
  --aside-width: 400px;
}

/* The step to the right of the title, bottom-aligned. */
.heading {
  grid-area: heading;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-6);
  padding: var(--sp-7) 0 calc(var(--sp-5) + var(--sp-1));
}

.titles {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}

/* Focus arrives programmatically after the step change; it is not a control. */
.title:focus {
  outline: none;
}

.subtitle {
  color: var(--ink-500);
}

/* A one-cell grid: whatever panel fills the slot takes the full height. */
.aside {
  grid-area: aside;
  display: grid;
}

.form {
  grid-area: form;
  align-self: start;
  margin-bottom: calc(var(--sp-8) + var(--sp-2));
}

/* 28 between the alert and the card, as between the header and the card. */
.notice:not(:empty) {
  margin-bottom: calc(var(--sp-5) + var(--sp-1));
}

/* One column, with the venue card before the form. */
@media (width <= 1023px) {
  .checkout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas:
      'heading'
      'aside'
      'form';
    align-content: start;
    gap: calc(var(--sp-4) + var(--sp-1));
    padding: var(--sp-6) var(--sp-6) var(--sp-7);
  }

  .heading,
  .form {
    width: 100%;
    max-width: none;
  }

  /* The step below the subtitle. */
  .heading {
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--sp-4) + var(--sp-1));
    padding: 0;
  }

  .heading h1 {
    font-size: var(--fs-40);
  }

  .form {
    margin-bottom: 0;
  }

  .notice:not(:empty) {
    margin-bottom: calc(var(--sp-4) + var(--sp-1));
  }
}

@media (width <= 639px) {
  .checkout {
    padding: var(--sp-5) calc(var(--sp-4) + var(--sp-1)) var(--sp-6);
  }

  .heading h1 {
    font-size: var(--fs-32);
  }
}
</style>
