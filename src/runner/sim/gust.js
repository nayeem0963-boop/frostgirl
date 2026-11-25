// World 06's aurora gusts: at fixed distances a gust of wind shoves Aisha one lane to the left or right. Pure functions of the run
// distance (the same on every attempt) so they are predictable and testable.
//
//   gust = { startAt, period, jitter } (src/worlds/runnerThemes.js): gust k blows when she crosses  startAt + k x period + jitter x h(k)
//   metres, to the side h2(k) picks. The generator keeps every obstacle row out of [at - pre, at + post] (config.js GUST), so the
//   shove can never push her into something she cannot get away from.

import { GUST } from '../config.js'

// small deterministic hashes (0..1) so gusts are irregular but identical every run
const h1 = (k) => { let x = Math.imul(k + 1, 0x9e3779b1) ^ 0x85ebca6b; x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; return (x >>> 0) / 4294967296 }
const h2 = (k) => h1(k * 7 + 13)

/** Gust number k: where it blows (metres run) and which way (-1 left, +1 right). */
export function gustAt(k, g) {
  return { at: g.startAt + k * g.period + h1(k) * g.jitter, dir: h2(k) < 0.5 ? -1 : 1 }
}

/** Index of the first gust that has not blown yet at this distance. */
export function nextGustIndex(dist, g) {
  let k = Math.max(0, Math.floor((dist - g.startAt - g.jitter) / g.period))
  while (gustAt(k, g).at <= dist) k++
  while (k > 0 && gustAt(k - 1, g).at > dist) k--
  return k
}

/** Move a row position out of every gust's keep-clear window [at - pre, at + post] (always later, so gaps only grow). */
export function avoidGust(pos, g) {
  let p = pos
  for (let k = Math.max(0, nextGustIndex(p - GUST.post - 1, g)); k < nextGustIndex(p + GUST.pre + GUST.post + 40, g) + 1; k++) {
    const { at } = gustAt(k, g)
    if (p >= at - GUST.pre && p <= at + GUST.post) p = at + GUST.post + 0.01
  }
  return p
}
