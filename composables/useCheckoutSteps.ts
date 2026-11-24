import type { MaybeRefOrGetter } from 'vue'
import type { PurchaseStep } from '../types'

/**
 * The two purchase steps, shared by theater, cinema and museum. They live on the
 * same route as internal state: going back and forth keeps what was entered, and
 * focus moves to the new step's title because without a route change a screen
 * reader would not notice.
 *
 * `quote` is the quote from the category composite, or null until it returns OK.
 * Without a quote there is no step 2.
 */
export function useCheckoutSteps(quoteSource: MaybeRefOrGetter<unknown>) {
  const quote = computed(() => toValue(quoteSource))

  const step = ref<PurchaseStep>('tickets')
  // Focus goes to the title only after a step change, not on page load.
  const stepChanged = ref(false)

  function goTo(next: PurchaseStep): void {
    step.value = next
    stepChanged.value = true
    // The route does not change: the page scrolls up without animation (RNF-11).
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }

  // Guard: if the quote stops existing on step 2, go back to step 1.
  watch(quote, (current) => {
    if (current === null && step.value === 'payment') goTo('tickets')
  })

  return { step, stepChanged, goTo }
}
