// Game feel: haptics for the sim's events. Pure rules here, the browser call is isolated in `buzz`.
// Cosmetic only: nothing in the simulation depends on it. Off for Auto play (watch-only) and switchable by the player.
export const HAPTICS_KEY = 'frost-runner-haptics-v1'

/** Vibration patterns in milliseconds (a single number is one pulse; arrays alternate pulse / pause). */
export const HAPTIC_PATTERNS = {
  orb: 8,
  nearMiss: 14,
  gust: [16, 40, 16],
  hit: [45, 30, 90],
  complete: [30, 50, 30, 50, 70],
}

/** The pattern for a sim event, or null when it has none. */
export const hapticFor = (event) => HAPTIC_PATTERNS[event] ?? null

export function loadHaptics(storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { return storage?.getItem(HAPTICS_KEY) !== 'off' } catch { return true } // on unless the player turned it off
}

export function saveHaptics(on, storage = typeof localStorage === 'undefined' ? null : localStorage) {
  try { storage?.setItem(HAPTICS_KEY, on ? 'on' : 'off') } catch { /* private mode: the setting just lasts for this visit */ }
}

/** Is there anything to vibrate with? (desktop browsers and iOS Safari have no vibration motor/API) */
export const hapticsSupported = (nav = typeof navigator === 'undefined' ? null : navigator) => !!nav && typeof nav.vibrate === 'function'

/** Vibrate for an event if the player wants it and the device can. Returns whether a pulse was requested. */
export function buzz(event, { enabled = true, auto = false, nav = typeof navigator === 'undefined' ? null : navigator } = {}) {
  const pattern = hapticFor(event)
  if (!enabled || auto || pattern === null || !hapticsSupported(nav)) return false
  try { nav.vibrate(pattern); return true } catch { return false }
}
