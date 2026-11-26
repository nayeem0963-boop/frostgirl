// The spiral mountain trail (7.2). The simulation stays a straight three-lane track (runner at z = 0, world scrolling +z), so
// collisions, lanes, jumps, ducks and scoring are exactly the same on every world. The trail is *drawn* curving: every world
// object is bent along a path that is computed here, relative to the runner, and a vertex shader (scene/bendMaterial.js) applies it.
//
// The path is the one from the retired Frost Girl spiral track, simplified: the heading turns steadily one way (a spiral up the
// mountain) with a slowly changing curvature, and the trail rolls over gentle rises. At the runner (s = 0) the offset and its
// slope are zero by construction, so the runner never drifts from the trail and the lanes under her feet are the sim's lanes (the climb's slope is a few degrees at most).
//
// `s` below is metres ahead of the runner along the trail (negative = behind). Everything here is pure maths (no three.js).

export const S_MIN = -40 // table range: behind the camera ...
export const S_MAX = 408 // ... to past the end of the ground
export const STEP = 8 // metres between table rows
export const ROWS = (S_MAX - S_MIN) / STEP + 1 // 57
const H = 2 // integration step (m)
const RAMP_IN = 90 // the first metres of a run are straight, then the curve eases in
const RAMP_OUT = 90 // and it eases out before the finish gate

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c) }

/**
 * Curve parameters for a world.
 * spiral: { turn, wobble, rise, hills } from the world's runner theme (null = a straight trail)
 *   turn   mean curvature (1/m): 0.0065 is a radius of about 150 m
 *   wobble how much the curvature varies (0..1), like the original track's changing radius
 *   rise   climb per metre of trail (the original spiral rose 0.0235 m per metre)
 *   hills  amplitude (m) of the gentle rolling of the trail
 * reduce: Reduce motion. The curve is fixed (no wobble, no rolling hills) and gentler.
 * finish: the level's finish distance (null in Endless), where the curve eases back to straight.
 */
export function curveFor(spiral, { reduce = false, finish = null } = {}) {
  if (!spiral) return null
  return {
    turn: spiral.turn * (reduce ? 0.45 : 1),
    wobble: reduce ? 0 : spiral.wobble,
    rise: spiral.rise * (reduce ? 0.5 : 1),
    hills: reduce ? 0 : spiral.hills,
    finish,
  }
}

const OMEGA = 0.031 // curvature wobble: one cycle every ~200 m
const HILL = 0.052 // rolling hills: one every ~120 m

function gain(c, d) {
  const g = smooth(d / RAMP_IN)
  return c.finish == null ? g : g * smooth((c.finish - d) / RAMP_OUT)
}
const curvature = (c, d) => (d <= 0 ? 0 : gain(c, d) * c.turn * (1 + c.wobble * Math.sin(d * OMEGA)))
const grade = (c, d) => (d <= 0 ? 0 : gain(c, d) * (c.rise + c.hills * HILL * Math.cos(d * HILL))) // climb per metre (the rolling hills are the sine's slope)

/**
 * Fill `out` (a Float32Array of ROWS * 4) with the trail's offset at each row: x = lateral offset, y = rise, z = distance
 * covered along z (so the point is at world z = -z), w = heading (radians, positive turns right). All relative to the
 * runner at run distance d0. Row i is at s = S_MIN + i * STEP.
 */
export function bendTable(c, d0, out = new Float32Array(ROWS * 4)) {
  if (!c) { fillStraight(out); return out }
  const n = Math.round((S_MAX - S_MIN) / H)
  const i0 = Math.round(-S_MIN / H) // sample index of s = 0
  const psi = new Float64Array(n + 1) // heading at every sample (absolute), integrated from the curvature
  const alt = new Float64Array(n + 1) // height at every sample, integrated from the grade
  let a = 0, h = 0
  psi[0] = 0; alt[0] = 0
  for (let i = 1; i <= n; i++) {
    const d = d0 + S_MIN + (i - 0.5) * H
    a += curvature(c, d) * H; h += grade(c, d) * H
    psi[i] = a; alt[i] = h
  }
  const x = new Float64Array(n + 1), z = new Float64Array(n + 1)
  // walk outward from the runner so that x = z = 0 and the heading is 0 at s = 0
  const rel = (i) => psi[i] - psi[i0]
  for (let i = i0 + 1; i <= n; i++) {
    const m = (rel(i) + rel(i - 1)) / 2
    x[i] = x[i - 1] + Math.sin(m) * H; z[i] = z[i - 1] + Math.cos(m) * H
  }
  for (let i = i0 - 1; i >= 0; i--) {
    const m = (rel(i) + rel(i + 1)) / 2
    x[i] = x[i + 1] - Math.sin(m) * H; z[i] = z[i + 1] - Math.cos(m) * H
  }
  for (let r = 0; r < ROWS; r++) {
    const s = S_MIN + r * STEP
    const i = Math.round((s - S_MIN) / H)
    out[r * 4] = x[i]
    out[r * 4 + 1] = alt[i] - alt[i0] // the climb stays: the trail rises (or dips) ahead of her
    out[r * 4 + 2] = z[i]
    out[r * 4 + 3] = rel(i)
  }
  return out
}

function fillStraight(out) {
  for (let r = 0; r < ROWS; r++) { out[r * 4] = 0; out[r * 4 + 1] = 0; out[r * 4 + 2] = S_MIN + r * STEP; out[r * 4 + 3] = 0 }
}

/** Linear lookup of the table at s (the same interpolation the shader does). Returns { x, y, z, w } (written into `into`). */
export function bendAt(table, s, into = {}) {
  const f = Math.min(ROWS - 1, Math.max(0, (s - S_MIN) / STEP))
  const i = Math.min(ROWS - 2, Math.floor(f)), t = f - i
  const k = (j, o) => table[j * 4 + o] * (1 - t) + table[(j + 1) * 4 + o] * t
  into.x = k(i, 0); into.y = k(i, 1); into.z = k(i, 2); into.w = k(i, 3)
  return into
}

/**
 * Where a point on the straight track ends up when drawn: lateral offset `x`, height `y`, `s` metres ahead. This is the shader's
 * formula in plain JS (tests use it to prove the runner stays on the trail). The sideways spread is limited to ±SPREAD so that far-off
 * scenery shears instead of swinging.
 */
export const SPREAD = 40
export function bendPoint(table, x, y, s, out = {}) {
  const r = bendAt(table, s, {})
  const xr = Math.max(-SPREAD, Math.min(SPREAD, x))
  out.x = r.x + xr * Math.cos(r.w) + (x - xr)
  out.y = y + r.y
  out.z = -(r.z) + xr * Math.sin(r.w)
  return out
}

/** Camera aim: how far to the side the trail has gone `ahead` metres in front of the runner, for the camera to turn into the bend. */
export function lookShift(table, ahead = 24, follow = 0.6) { return bendAt(table, ahead, {}).x * follow }
