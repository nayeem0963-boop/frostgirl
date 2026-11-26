// What the runner sounds like (6.2). Pure rules only: no Web Audio here, so every rule is testable in plain Node.
// The engine (engine.js) turns a recipe from this file into oscillators and filtered noise. Nothing is downloaded: it is all synthesized.
import { WOLF, SHARD, HOLE } from '../config.js'

/** A recipe is a list of layers. tone: an oscillator with a pitch glide; noise: filtered noise. Times in seconds, gains 0..1. */
const tone = (type, f0, f1, dur, gain, o = {}) => ({ kind: 'tone', type, f0, f1: f1 ?? f0, dur, gain, delay: 0, ...o })
const noise = (filter, f0, f1, dur, gain, o = {}) => ({ kind: 'noise', filter, f0, f1: f1 ?? f0, dur, gain, q: 1, delay: 0, ...o })

// Orb chime pitches: a major pentatonic ladder, so a chain of orbs always sounds pleasant and climbs.
export const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19]
export const BASE_ORB_HZ = 660
export const COMBO_WINDOW = 1.2 // seconds between orbs that still count as one chain
export const orbHz = (step) => BASE_ORB_HZ * 2 ** (SCALE[Math.max(0, Math.min(SCALE.length - 1, step))] / 12)

/** Tracks a chain of orbs: each orb within COMBO_WINDOW of the last climbs one step; a pause starts again from the bottom. */
export class ComboTracker {
  constructor() { this.last = -Infinity; this.step = -1 }
  hit(time) {
    this.step = time - this.last <= COMBO_WINDOW ? Math.min(this.step + 1, SCALE.length - 1) : 0
    this.last = time
    return this.step
  }
  reset() { this.last = -Infinity; this.step = -1 }
}

// Footsteps follow the run animation: the run clip covers 4 m/s of ground per cycle at 1x and plays at a rate proportional to the
// speed, so one cycle is always the same distance (2.52 m) and there are two footfalls per cycle.
export const STEP_METRES = 1.26
/** How many footfalls happened between two distances (and whether the next one is the right foot). */
export function stepsBetween(prevDist, dist) {
  if (!(dist > prevDist)) return { count: 0, startRight: false }
  const a = Math.floor(prevDist / STEP_METRES), b = Math.floor(dist / STEP_METRES)
  return { count: b - a, startRight: (a + 1) % 2 === 1 }
}

/** Distances (metres ahead of Aisha) at which an approaching hazard gets its warning sound: when the telegraph starts. */
export const CUES = {
  wolf: WOLF.lungeFrom + 2, // a growl just before it runs
  shard: SHARD.dropFrom, // the whistle of the falling spire
  hole: HOLE.breakFrom + 6, // the ice cracking
}
/** Does this obstacle need its warning sound now? (once: the caller remembers ids it has cued) */
export const cueDue = (kind, ahead) => CUES[kind] !== undefined && ahead <= CUES[kind] && ahead > 0

export const RECIPES = {
  start: [tone('sine', 392, 392, 0.18, 0.18), tone('sine', 523, 523, 0.3, 0.18, { delay: 0.12 })],
  jump: [noise('highpass', 900, 2600, 0.14, 0.12), tone('sine', 300, 520, 0.12, 0.1)],
  land: [tone('sine', 130, 55, 0.14, 0.3), noise('lowpass', 900, 200, 0.12, 0.2)],
  lane: [noise('bandpass', 1100, 2200, 0.09, 0.1, { q: 1.4 })],
  duck: [noise('lowpass', 2400, 500, 0.12, 0.12)],
  nearMiss: [noise('bandpass', 500, 2800, 0.28, 0.18, { q: 1.2, swell: 0.4 })],
  gust: [noise('bandpass', 260, 900, 1.3, 0.28, { q: 0.8, swell: 0.5 })],
  hit: [noise('lowpass', 1600, 180, 0.38, 0.5), tone('sine', 95, 40, 0.32, 0.5), noise('highpass', 3500, 3500, 0.07, 0.25)],
  complete: [523, 659, 784, 1047].flatMap((f, i) => [tone('sine', f, f, 0.5, 0.18, { delay: i * 0.13 }), tone('sine', f * 2.01, f * 2.01, 0.35, 0.05, { delay: i * 0.13 })]),
  // hazard warnings
  wolf: [tone('sawtooth', 78, 52, 0.75, 0.22, { lowpass: 420, tremolo: 14 })],
  shard: [tone('sine', 1900, 380, 0.95, 0.11), tone('triangle', 2500, 700, 0.7, 0.04, { delay: 0.1 })],
  hole: [0, 0.09, 0.17].map((d) => noise('bandpass', 2400, 1400, 0.05, 0.18, { q: 4, delay: d })).concat([tone('sine', 170, 90, 0.35, 0.16, { delay: 0.2 })]),
}

/**
 * Loudness trim per sound, tuned from the offline measurement (scripts/audio-report.mjs): filtered noise carries far less energy than a
 * tone of the same gain, so each sound gets a multiplier that brings its measured peak into a sensible band. The crash is the loudest.
 */
export const LEVEL = { start: 1.5, jump: 3.6, land: 3, lane: 12, duck: 6, orb: 3.2, nearMiss: 4.5, gust: 2.6, hit: 3.2, complete: 1.4, wolf: 2.6, shard: 2.4, hole: 1.4, step: 2.2 }

/** The chime for an orb at a chain step. */
export const orbRecipe = (step) => { const f = orbHz(step); return [tone('sine', f, f, 0.42, 0.2), tone('sine', f * 2.01, f * 2.01, 0.25, 0.06)] }
/** A footfall: a short crunch of snow; left and right differ a little. */
export const stepRecipe = (right) => [noise('bandpass', right ? 3300 : 2700, right ? 2500 : 2100, 0.05, 0.05, { q: 1.1 })]

/** Where in the stereo field (-1 left .. 1 right) an event is heard. */
export const panFor = (event, ctx = {}) => {
  if (event === 'lane' || event === 'gust') return Math.max(-1, Math.min(1, (ctx.dir ?? 0) * 0.6))
  if (event === 'wolf') return Math.max(-1, Math.min(1, ctx.x / 5))
  return Math.max(-1, Math.min(1, (ctx.x ?? 0) / 4))
}

/** The events the simulation emits that make a sound. */
export const SOUND_EVENTS = ['start', 'jump', 'land', 'lane', 'duck', 'orb', 'nearMiss', 'gust', 'hit', 'complete']

/** Ambient wind: gain and brightness (Hz of the low-pass). Thick mist muffles it; the player running opens it up a little. */
export function ambientFor({ running, mist = 0, speed = 0 }) {
  if (!running) return { gain: 0, cutoff: 500 }
  return { gain: 0.05 + Math.min(1, speed / 12.5) * 0.03, cutoff: 900 - 520 * mist }
}
