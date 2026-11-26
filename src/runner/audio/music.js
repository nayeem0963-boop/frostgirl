// Generative background music (7.0). Pure composition rules: no Web Audio here, so every rule is testable in plain Node.
// A calm loop built only from pentatonic notes (any mix of them sounds consonant): a slow pad that changes chord every two bars, a soft bass
// root, and sparse bell notes. Each world has its own key, scale and tempo. It is generated bar by bar from a seeded random source, so it never
// repeats exactly but is reproducible in tests. Nothing is downloaded.
const MAJOR = [0, 2, 4, 7, 9]
const MINOR = [0, 3, 5, 7, 10]

/** Per world: root (MIDI note), scale, tempo (beats per minute), bell density (0..1 per eighth note) and an optional upper pad. */
export const WORLD_MUSIC = {
  '01': { root: 57, scale: MAJOR, bpm: 68, bells: 0.16 },
  '02': { root: 55, scale: MINOR, bpm: 64, bells: 0.14 },
  '03': { root: 62, scale: MAJOR, bpm: 72, bells: 0.26 },
  '04': { root: 52, scale: MINOR, bpm: 60, bells: 0.12 },
  '05': { root: 53, scale: MAJOR, bpm: 56, bells: 0.1 },
  '06': { root: 59, scale: MAJOR, bpm: 76, bells: 0.24 },
  '07': { root: 60, scale: MAJOR, bpm: 80, bells: 0.22, upper: true },
}
export const BEATS_PER_BAR = 4
export const CHORD_BARS = 2 // the pad changes chord every two bars
// Chord roots as steps into the scale (0 = the tonic): a gentle loop that always comes home.
export const PROGRESSION = [0, 3, 1, 4]

export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12)
export const barSeconds = (worldId) => (60 / (WORLD_MUSIC[worldId] ?? WORLD_MUSIC['01']).bpm) * BEATS_PER_BAR

/** The MIDI note `step` steps up the world's scale from its root (steps may exceed the scale length: they climb octaves). */
export function scaleNote(world, step) {
  const n = world.scale.length
  const oct = Math.floor(step / n), i = ((step % n) + n) % n
  return world.root + world.scale[i] + 12 * oct
}

/** Every MIDI pitch class (0..11) the world's scale allows. */
export const pitchClasses = (world) => new Set(world.scale.map((s) => (world.root + s) % 12))

/** Small deterministic random source: the same seed always gives the same music. */
export function rng(seed) {
  let a = (seed >>> 0) || 1
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const tone = (type, hz, dur, gain, o = {}) => ({ kind: 'tone', type, f0: hz, f1: hz, dur, gain, delay: 0, ...o })

/**
 * The notes of one bar: [{ at (seconds from the bar start), layer }]. A bar is a pure function of (world, bar number, seed).
 * Every pitch is in the world's pentatonic scale; the pad plays only on the first bar of each chord.
 */
export function composeBar(worldId, bar, seed = 1) {
  const world = WORLD_MUSIC[worldId] ?? WORLD_MUSIC['01']
  const beat = 60 / world.bpm, barDur = beat * BEATS_PER_BAR
  const r = rng(seed * 7919 + bar * 104729 + Number(worldId.replace(/\D/g, '') || 1))
  const out = []
  const chord = PROGRESSION[Math.floor(bar / CHORD_BARS) % PROGRESSION.length]
  if (bar % CHORD_BARS === 0) {
    const padDur = barDur * CHORD_BARS + 1.6 // a little overlap into the next chord
    for (const [k, step] of [[0, chord], [1, chord + 2], [2, chord + 4]]) {
      const hz = midiHz(scaleNote(world, step + 5) - 12) // pad sits an octave below the bells
      out.push({ at: 0.04 * k, layer: tone('triangle', hz, padDur, 0.05, { swell: 0.35 }) })
      out.push({ at: 0.04 * k, layer: tone('sine', hz * 1.004, padDur, 0.035, { swell: 0.4 }) }) // a slightly detuned twin: a gentle shimmer
    }
    out.push({ at: 0, layer: tone('sine', midiHz(scaleNote(world, chord) - 12), padDur, 0.09, { swell: 0.3 }) }) // bass root
    if (world.upper) out.push({ at: 0.1, layer: tone('triangle', midiHz(scaleNote(world, chord + 4 + 5) + 12), padDur, 0.025, { swell: 0.5 }) })
  }
  // bells: a few soft notes on eighth-note positions, mostly chord tones, never two on the same position
  const eighth = beat / 2
  let last = -1
  for (let i = 0; i < BEATS_PER_BAR * 2; i++) {
    if (r() > world.bells) continue
    const degree = (chord + [0, 2, 4, 0, 2][Math.floor(r() * 5)]) % world.scale.length // a chord tone of this bar
    const step = 5 + degree + (degree < 2 && r() < 0.25 ? 5 : 0) // one octave above the root, rarely two: about 330-1400 Hz, never shrill
    const stepSame = step === last
    last = step
    if (stepSame) continue
    out.push({ at: i * eighth, layer: tone('sine', midiHz(scaleNote(world, step)), 1.6, 0.045) })
    if (r() < 0.35) out.push({ at: i * eighth, layer: tone('sine', midiHz(scaleNote(world, step)) * 2.005, 0.9, 0.012) }) // a faint overtone
  }
  return out
}

/** How loud the music is while the game is in a state (relative to its full level): calm on the start screen, silent when paused, soft after a crash. */
export const MUSIC_STATE = { ready: 0.8, running: 1, paused: 0, gameover: 0.35, complete: 0.7 }
export const musicTarget = (phase, paused) => (paused ? 0 : (MUSIC_STATE[phase] ?? 1))
/** Thick mist muffles the music like the wind: the low-pass cutoff in Hz. */
export const musicCutoff = (mist = 0) => 3800 - 2400 * Math.max(0, Math.min(1, mist))
