// Player settings for the runner (6.4). Pure rules + a tiny localStorage wrapper; every setting is cosmetic or an accessibility aid:
// none of them touches the simulation (speed, collisions, scoring, the generator), so scores stay comparable.
import { HAPTICS_KEY } from './feel.js'

export const SETTINGS_KEY = 'frost-runner-settings-v1'

export const DEFAULT_SETTINGS = {
  haptics: true, // vibration on pickups, gusts, near misses, hits (phones that support it)
  music: true, // a calm generative music loop (needs Sound on too); never in Auto play
  sound: true, // synthesized sound effects and a soft wind bed (never in Auto play); starts only after the first tap or key press
  motion: 'auto', // 'auto' follows the system "reduce motion" preference | 'on' | 'off': no camera shake, no flashes
  quality: 'auto', // 'auto' picks from the screen and pointer | 'low' | 'high'
  buttons: 'auto', // on-screen LEFT / RIGHT and JUMP / SLIDE buttons: 'auto' shows them on touch screens | 'on' | 'off'. Keys and swipes always work too
  leftHanded: false, // the pause button moves to the left edge, away from a right thumb that is swiping
  highContrast: false, // warm amber glow on obstacles so they stand out from snow and ice for every kind of colour vision
  outfit: 'frost', // which of Aisha's outfits to draw (outfits.js); one that is still locked falls back to the original
  difficulty: 'normal', // 'easy' | 'normal' | 'hard': how often and how tightly obstacles come (sim/difficulty.js); never the physics
  hintSeen: false, // the first-run controls hint has been dismissed
}

export const CHOICES = { motion: ['auto', 'on', 'off'], buttons: ['auto', 'on', 'off'], quality: ['auto', 'low', 'high'], difficulty: ['easy', 'normal', 'hard'] }

const store = () => (typeof localStorage === 'undefined' ? null : localStorage)

/** Keep only known keys with values of the right type, so a hand-edited or older save can never break the game. */
export function sanitize(raw) {
  const out = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return out
  for (const k of ['haptics', 'sound', 'music', 'leftHanded', 'highContrast', 'hintSeen']) if (typeof raw[k] === 'boolean') out[k] = raw[k]
  if (typeof raw.outfit === 'string' && /^[a-z]{2,12}$/.test(raw.outfit)) out.outfit = raw.outfit
  for (const k of ['motion', 'buttons', 'quality', 'difficulty']) if (CHOICES[k].includes(raw[k])) out[k] = raw[k]
  return out
}

export function loadSettings(storage = store()) {
  try {
    const text = storage?.getItem(SETTINGS_KEY)
    if (text) return sanitize(JSON.parse(text))
    const legacy = storage?.getItem(HAPTICS_KEY) // the 6.3 vibration switch, before there was a settings sheet
    return { ...DEFAULT_SETTINGS, haptics: legacy !== 'off' }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function saveSettings(settings, storage = store()) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(sanitize(settings))) } catch { /* private mode: settings last for this visit only */ }
}

/** The next value of a cycling setting (auto -> on -> off -> auto, auto -> low -> high -> auto). */
export const nextChoice = (key, value) => { const c = CHOICES[key]; return c[(c.indexOf(value) + 1) % c.length] }

/** Reduce motion: the player's choice, else the system preference. */
export const resolveReducedMotion = (settings, systemPrefersReduced) => settings.motion === 'on' || (settings.motion === 'auto' && !!systemPrefersReduced)

/** Render quality: the player's choice, else what the device suggests. */
// (kept for reference and tests: the game now uses quality.js `activeTier` with an adaptive tier for 'auto')
export const resolveQuality = (settings, detected) => (settings.quality === 'auto' ? detected : settings.quality)

/** The first-run hint shows until the first jump, or after this many metres of running (about 15 s; it never hangs around for good). */
export const HINT_MAX_METRES = 110
export const showHint = (settings, { auto, phase, dist }) => !settings.hintSeen && !auto && phase === 'running' && dist < HINT_MAX_METRES

/** On-screen control buttons: the player's choice, else on for touch screens (a coarse pointer). */
export const showButtons = (settings, coarsePointer) => settings.buttons === 'on' || (settings.buttons === 'auto' && !!coarsePointer)
