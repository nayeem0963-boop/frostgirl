// Pure placement rules for the decorative pines (no three.js here so tests can
// check them). The forest is a ring of recycled slots: a slot is `ahead`
// metres in front of the runner, wraps around when it drops behind, and gets
// fresh lateral position/height each lap so the repetition is not visible.
import { LANES, OBSTACLES } from '../config.js'

export const SLOTS_PER_SIDE = 56
export const LOOP = 250 // metres
export const BEHIND = 30 // slots are kept this far behind the runner before wrapping
export const VARIANTS = [0, 2, 4, 6] // spruce variants from alpine-spruces.glb
/** Trunk centres are never closer to the track centre than this. Crowns reach ~0.22 h further in. */
export const TREE_MIN_X = LANES[2] + OBSTACLES.wall.halfW + 7.5

function hash(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** A slot's tree for a lap. Slot index i: even = left side, odd = right. */
export function treeAt(i, lap) {
  const side = i % 2 === 0 ? -1 : 1
  const k = Math.floor(i / 2)
  const h = 7 + hash(i, lap * 7 + 1) * 7.5 // 7 - 14.5 m
  const crown = h * 0.22
  // two bands: an inner row hugging the trail edge and a sparser outer forest
  const outer = hash(i, lap * 7 + 2) < 0.55
  const x = side * (TREE_MIN_X + crown + (outer ? 2 + hash(i, lap * 7 + 3) * 16 : hash(i, lap * 7 + 3) * 3))
  return {
    x,
    h,
    rot: hash(i, lap * 7 + 4) * Math.PI * 2,
    lean: (hash(i, lap * 7 + 5) - 0.5) * 0.06,
    v: VARIANTS[Math.floor(hash(i, 99) * VARIANTS.length)],
    base: (k + hash(i, 5) * 0.9) * (LOOP / SLOTS_PER_SIDE), // slot's fixed phase along the loop
  }
}

/** Every slot's first-lap tree (used by tests). */
export function scatterTrees() {
  const out = []
  for (let i = 0; i < SLOTS_PER_SIDE * 2; i++) out.push(treeAt(i, 0))
  for (let i = 0; i < SLOTS_PER_SIDE * 2; i++) out.push(treeAt(i, 5))
  return out
}

/** Which lap and distance ahead a slot is at for a given run distance. */
export function slotAhead(base, dist) {
  const raw = base - dist + BEHIND
  const lap = Math.floor(raw / LOOP)
  return { ahead: raw - lap * LOOP - BEHIND, lap }
}

/** Terrain height beside the trail: flat running surface, a soft snow bank at the shoulder, then a gentle rise. */
export function groundY(x) {
  const ax = Math.abs(x)
  const t = Math.min(1, Math.max(0, (ax - 3.7) / 3))
  return t * t * (3 - 2 * t) * 0.3 + Math.max(0, ax - 14) * 0.045
}
