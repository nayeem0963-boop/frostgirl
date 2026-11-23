// The Frozen Trail: a winding path from the forest trailhead (south, +z)
// up to the ridge checkpoint (north, -z). Pure data + geometry queries.

// Control points (x, z). The trail climbs as z decreases.
export const TRAIL_CONTROL = [
  [0, 178], [4, 160], [14, 138], [22, 116], [17, 94], [4, 74], [-10, 56],
  [-21, 34], [-19, 12], [-8, -8], [6, -28], [18, -48], [22, -70], [17, -94],
  [3, -116], [-10, -136], [-16, -158], [-13, -182],
]

export const TRAIL_HALF_WIDTH = 1.9

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

function buildSamples(step = 0.75) {
  const dense = []
  const pts = TRAIL_CONTROL
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let k = 0; k < 40; k++) {
      const t = k / 40
      dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)])
    }
  }
  dense.push(pts[pts.length - 1].slice())
  // Resample at an even spacing.
  const xs = [dense[0][0]]
  const zs = [dense[0][1]]
  const ss = [0]
  let carry = 0
  let total = 0
  for (let i = 1; i < dense.length; i++) {
    const ax = dense[i - 1][0]
    const az = dense[i - 1][1]
    const dx = dense[i][0] - ax
    const dz = dense[i][1] - az
    const len = Math.hypot(dx, dz)
    let d = step - carry
    while (d <= len) {
      xs.push(ax + dx * d / len)
      zs.push(az + dz * d / len)
      total += step
      ss.push(total)
      d += step
    }
    carry = len - (d - step)
  }
  return { xs: Float32Array.from(xs), zs: Float32Array.from(zs), ss: Float32Array.from(ss), step }
}

export const trail = buildSamples()
export const TRAIL_LENGTH = trail.ss[trail.ss.length - 1]
const N = trail.xs.length
const COARSE = 8

/** Point + tangent on the trail at arc length s. */
export function trailPoint(s) {
  const f = Math.max(0, Math.min(N - 1.001, s / trail.step))
  const i = Math.floor(f)
  const t = f - i
  const x = trail.xs[i] + (trail.xs[i + 1] - trail.xs[i]) * t
  const z = trail.zs[i] + (trail.zs[i + 1] - trail.zs[i]) * t
  const tx = trail.xs[i + 1] - trail.xs[i]
  const tz = trail.zs[i + 1] - trail.zs[i]
  const l = Math.hypot(tx, tz) || 1
  return { x, z, tx: tx / l, tz: tz / l }
}

const result = { d: 0, s: 0, side: 0, x: 0, z: 0 }

/**
 * Nearest trail point. Returns a shared object: { d, s, side, x, z }.
 * `side` is the signed lateral offset (+ = right of travel direction).
 */
export function nearestTrail(px, pz, out = result) {
  let best = Infinity
  let bi = 0
  for (let i = 0; i < N; i += COARSE) {
    const dx = trail.xs[i] - px
    const dz = trail.zs[i] - pz
    const d2 = dx * dx + dz * dz
    if (d2 < best) { best = d2; bi = i }
  }
  const lo = Math.max(0, bi - COARSE * 2)
  const hi = Math.min(N - 2, bi + COARSE * 2)
  best = Infinity
  let bs = 0
  let bx = 0
  let bz = 0
  let bside = 0
  for (let i = lo; i <= hi; i++) {
    const ax = trail.xs[i]
    const az = trail.zs[i]
    const ex = trail.xs[i + 1] - ax
    const ez = trail.zs[i + 1] - az
    const l2 = ex * ex + ez * ez || 1
    let t = ((px - ax) * ex + (pz - az) * ez) / l2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const cx = ax + ex * t
    const cz = az + ez * t
    const dx = px - cx
    const dz = pz - cz
    const d2 = dx * dx + dz * dz
    if (d2 < best) {
      best = d2
      bs = trail.ss[i] + t * trail.step
      bx = cx
      bz = cz
      // right-hand side of the travel direction (x-z plane, y up): (-ez, ex)
      bside = Math.sign(dx * -ez + dz * ex)
    }
  }
  out.d = Math.sqrt(best)
  out.s = bs
  out.side = bside * out.d
  out.x = bx
  out.z = bz
  return out
}
