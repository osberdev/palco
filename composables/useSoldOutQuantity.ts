import type { MaybeRefOrGetter, Ref } from 'vue'
import { initialQuantity } from '../utils/quantity'

/**
 * A purchase quantity, adjusted for sold-out venues. Shared by the three purchases.
 *
 * It is decided here rather than in `QuantityField` for two reasons:
 *
 * - **On load.** The composable knows the detail before the first render, so the
 *   server HTML already carries the 0. An `onMounted` in the field does not run
 *   on the server.
 * - **After a rejection.** The detail is requested again with step 2 on screen
 *   and the field unmounted. When going back to step 1 the field mounts with
 *   `soldOut` already `true`, and a `watch` on it never sees the change. This
 *   composable keeps watching availability.
 */
export function useSoldOutQuantity(availableSource: MaybeRefOrGetter<number>): Ref<string> {
  const quantity = ref(initialQuantity(toValue(availableSource)))
  watch(() => toValue(availableSource), (available) => {
    if (available === 0) quantity.value = '0'
  })
  return quantity
}
