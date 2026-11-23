// Procedural alpine terrain: a valley carved by the trail, rising walls,
// a ravine beside the ledge section, a frozen stream, and distant ridges.
// The rendered mesh and gameplay share the same height grid, so the
// character never floats above or sinks into the visible surface.
import { createNoise2D, fbm, ridged, smoothstep, clamp } from '../core/noise.js'
import { nearestTrail, TRAIL_HALF_WIDTH } from './trail.js'
import { LEVEL, streamDistance, ICE_ZONES } from './level.js'

const nA = createNoise2D(11)
const nB = createNoise2D(23)
const nC = createNoise2D(37)
const near = { d: 0, s: 0, side: 0, x: 0, z: 0 }

export const RAVINE_DEPTH = 16

/** Ledge mask 0..1 along the ledge section. */
function ledgeMask(s) {
  const { s0, s1 } = LEVEL.ledge
  return smoothstep(s0 - 6, s0 + 4, s) * (1 - smoothstep(s1 - 4, s1 + 6, s))
}

/** Analytic terrain height. Expensive-ish: use the grid sampler at runtime. */
export function terrainHeight(x, z, info) {
  const t = nearestTrail(x, z, near)
  const d = t.d
  // Overall climb toward the north plus broad undulation.
  const base = 0.15 * (180 - z) + 3.2 * fbm(nA, x / 190, z / 190, 3)
  // Valley walls rising away from the trail.
  const k = Math.max(0, d - 4.5)
  const walls = (0.1 * Math.pow(Math.min(k, 140), 1.33) + 0.06 * Math.max(0, k - 140)) * (0.75 + 0.5 * (fbm(nB, x / 120, z / 120, 2) + 1) * 0.5)
  // Hummocks and snow drifts, absent on the trail itself.
  const off = smoothstep(TRAIL_HALF_WIDTH + 0.4, 9, d)
  const hummocks = 3.4 * fbm(nB, x / 38, z / 38, 4) * off
  const drifts = 0.45 * fbm(nC, x / 7.5, z / 7.5, 3) * smoothstep(TRAIL_HALF_WIDTH, 4, d)
  // Boulder-strewn rocky outcrops further out.
  const crags = 9 * Math.max(0, ridged(nC, x / 55, z / 55, 3) - 0.35) * smoothstep(14, 40, d)
  // Trail: slightly sunken, packed path with a soft crown.
  const trailDip = -0.16 * (1 - smoothstep(TRAIL_HALF_WIDTH - 0.6, TRAIL_HALF_WIDTH + 1.2, d))
  // Ploughed-snow berms framing the path.
  const berm = 0.32 * smoothstep(TRAIL_HALF_WIDTH - 0.2, TRAIL_HALF_WIDTH + 0.9, d) * (1 - smoothstep(TRAIL_HALF_WIDTH + 1.2, TRAIL_HALF_WIDTH + 3.2, d))
  let h = base + walls + hummocks + drifts + crags + trailDip + berm

  // Ravine on the right side of the ledge section.
  const lm = ledgeMask(t.s)
  if (lm > 0 && t.side > 0) {
    const edge = smoothstep(TRAIL_HALF_WIDTH + 0.7, TRAIL_HALF_WIDTH + 2.4, t.side)
    const far = 1 - smoothstep(16, 26, t.side)
    h -= RAVINE_DEPTH * lm * edge * far + walls * lm * edge * 0.8
  }
  // Raise the opposite side of the ledge into a cliff wall.
  if (lm > 0 && t.side < 0) h += 7 * lm * smoothstep(4, 9, -t.side)

  // Frozen stream bed.
  const sd = streamDistance(x, z)
  const bank = 1 - smoothstep(LEVEL.stream.halfWidth, LEVEL.stream.bankWidth, sd)
  if (bank > 0) {
    const onTrail = 1 - smoothstep(TRAIL_HALF_WIDTH, TRAIL_HALF_WIDTH + 3, d)
    h -= bank * (0.9 - 0.65 * onTrail)
  }

  // Distant mountain ridges surrounding the valley.
  const r = Math.hypot(x * 0.8, z)
  const far = smoothstep(220, 900, r)
  if (far > 0) {
    // Lower the ridges in a window to the north so the massif stays visible.
    const north = 1 - 0.75 * smoothstep(0.55, 0.92, -z / (r + 1e-3))
    h += far * (60 + 420 * north * ridged(nA, x / 650 + 3, z / 650, 5))
  }

  if (info) {
    info.d = d
    info.s = t.s
    info.side = t.side
    info.stream = sd
    info.ledge = lm
  }
  return h
}

// --- Rectilinear grid: fine near the trail, coarse toward the horizon ---------

function axis(min, max, step, outer, grow) {
  const out = []
  for (let v = min; v <= max + 1e-6; v += step) out.push(v)
  const pre = []
  let s = step
  for (let v = min; v > -outer;) { s *= grow; v -= s; pre.unshift(Math.max(v, -outer)) }
  const post = []
  s = step
  for (let v = max; v < outer;) { s *= grow; v += s; post.push(Math.min(v, outer)) }
  return Float32Array.from([...pre, ...out, ...post])
}

export const NEAR_BOUNDS = { minX: -112, maxX: 112, minZ: -214, maxZ: 210 }

export function buildTerrainGrid(step = 1.5) {
  const xs = axis(NEAR_BOUNDS.minX, NEAR_BOUNDS.maxX, step, 3200, 1.12)
  const zs = axis(NEAR_BOUNDS.minZ, NEAR_BOUNDS.maxZ, step, 3200, 1.12)
  const nx = xs.length
  const nz = zs.length
  const h = new Float32Array(nx * nz)
  const trailD = new Float32Array(nx * nz)
  const info = {}
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i
      h[idx] = terrainHeight(xs[i], zs[j], info)
      trailD[idx] = info.d
    }
  }
  return { xs, zs, nx, nz, h, trailD }
}

function findCell(arr, v) {
  let lo = 0
  let hi = arr.length - 1
  if (v <= arr[0]) return 0
  if (v >= arr[hi]) return hi - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= v) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Height sampler matching the triangulation used by the terrain mesh:
 * each cell (a=(i,j), b=(i,j+1), c=(i+1,j+1), d=(i+1,j)) is split along b-d.
 */
export function createSampler(grid) {
  const { xs, zs, nx, h } = grid
  function height(x, z) {
    const i = findCell(xs, x)
    const j = findCell(zs, z)
    const u = clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1)
    const v = clamp((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1)
    const ha = h[j * nx + i]
    const hb = h[(j + 1) * nx + i]
    const hc = h[(j + 1) * nx + i + 1]
    const hd = h[j * nx + i + 1]
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v)
  }
  function normal(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 0.6
    const dx = height(x + e, z) - height(x - e, z)
    const dz = height(x, z + e) - height(x, z - e)
    const l = Math.hypot(dx, 2 * e, dz)
    out.x = -dx / l
    out.y = (2 * e) / l
    out.z = -dz / l
    return out
  }
  return { height, normal }
}

/** Surface properties used by the player controller. */
export function surfaceAt(x, z, out = {}) {
  const t = nearestTrail(x, z, near)
  out.d = t.d
  out.s = t.s
  out.side = t.side
  out.onTrail = t.d < TRAIL_HALF_WIDTH + 0.5
  out.ledge = ledgeMask(t.s)
  out.ice = 0
  out.driftX = 0
  out.driftZ = 0
  const sd = streamDistance(x, z)
  if (sd < LEVEL.stream.halfWidth) out.ice = 1
  for (const zone of ICE_ZONES) {
    if (zone.kind !== 'disc') continue
    const dd = Math.hypot(x - zone.x, z - zone.z)
    if (dd < zone.radius) {
      out.ice = 1
      out.driftX = zone.driftX * zone.drift
      out.driftZ = zone.driftZ * zone.drift
    }
  }
  return out
}
