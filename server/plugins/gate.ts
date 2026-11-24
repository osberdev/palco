import { setGateConfig } from '../data/gate'
import { gateConfigFrom, gatePinWarning, parseGatePin } from '../utils/gate-config'

/**
 * The gate PIN at startup (RN-ACC-01). Without it, or with a value that breaks the
 * rule, the gate is disabled and a warning names the variable, never the value.
 * The server starts anyway: purchasing does not depend on the gate.
 */
export default defineNitroPlugin(() => {
  const pin = parseGatePin(process.env.NUXT_GATE_PIN)
  if (pin.kind === 'ok') {
    setGateConfig(gateConfigFrom(pin.pin))
    return
  }
  setGateConfig(null)
  console.warn(gatePinWarning(pin.kind))
})
