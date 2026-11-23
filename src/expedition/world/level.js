// Level layout for "The Frozen Trail" vertical slice.
// Everything is positioned by arc length along the trail so the layout
// survives edits to the trail spline.
import { TRAIL_LENGTH, trailPoint } from './trail.js'

const L = TRAIL_LENGTH

function along(s, lateral = 0) {
  const p = trailPoint(s)
  // right-hand normal of the travel direction
  const rx = -p.tz
  const rz = p.tx
  return { x: p.x + rx * lateral, z: p.z + rz * lateral, s, tx: p.tx, tz: p.tz, rx, rz }
}

export const LEVEL = {
  length: L,
  start: along(4),
  checkpoint: along(L - 5),
  wolf: { ...along(L * 0.2, 18), radius: 9, s: L * 0.2 },
  stream: { s: L * 0.32, halfWidth: 1.7, bankWidth: 3.4, ...along(L * 0.32) },
  rocks: { s: L * 0.44, ...along(L * 0.44) },
  snowbank: { s: L * 0.535, ...along(L * 0.535) },
  ledge: { s0: L * 0.6, s1: L * 0.76 },
  ledgeIce: { s: L * 0.665, ...along(L * 0.665, 0.4), radius: 3.6 },
  frostStone: { ...along(L * 0.84, -10), s: L * 0.84 },
  spirit: { ...along(L * 0.88, -70) },
}

// The frozen stream: a gently meandering polyline crossing the trail.
export const STREAM_POINTS = (() => {
  const c = LEVEL.stream
  const pts = []
  for (let k = -12; k <= 12; k++) {
    const lateral = k * 7
    const wiggle = Math.sin(k * 0.9) * 4 + Math.sin(k * 0.37 + 1) * 6
    pts.push([
      c.x + c.rx * lateral + c.tx * wiggle * (Math.abs(k) > 0 ? 1 : 0),
      c.z + c.rz * lateral + c.tz * wiggle * (Math.abs(k) > 0 ? 1 : 0),
    ])
  }
  return pts
})()

export function streamDistance(x, z) {
  let best = Infinity
  for (let i = 0; i < STREAM_POINTS.length - 1; i++) {
    const [ax, az] = STREAM_POINTS[i]
    const [bx, bz] = STREAM_POINTS[i + 1]
    const ex = bx - ax
    const ez = bz - az
    let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const dx = x - (ax + ex * t)
    const dz = z - (az + ez * t)
    const d = dx * dx + dz * dz
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

// Fallen boulders across the trail. `h` = height above ground.
// The centre boulder is low enough to jump onto / over.
export const TRAIL_BOULDERS = (() => {
  const r = LEVEL.rocks
  const at = (ds, lat, radius, h, seed) => ({ ...along(r.s + ds, lat), radius, h, seed })
  return [
    at(0, -0.3, 0.85, 0.72, 3),
    at(1.2, 2.6, 1.5, 2.3, 7),
    at(-1.0, -2.9, 1.6, 2.6, 11),
    at(3.6, -1.8, 0.7, 0.55, 5),
    at(-3.2, 2.4, 0.55, 0.45, 9),
  ]
})()

// Snowbanks pinching the trail to a narrow, single-file passage.
export const SNOWBANKS = (() => {
  const c = LEVEL.snowbank
  const out = []
  for (let k = -4; k <= 4; k++) {
    const pinch = 1 - Math.abs(k) / 5
    const gap = 2.6 - pinch * 1.75
    for (const side of [-1, 1]) {
      out.push({ ...along(c.s + k * 1.8, side * (gap + 0.9)), radius: 1.25, h: 1.1 + pinch * 0.6 })
    }
  }
  return out
})()

// Ice zones: friction + drift. The ledge ice gently pushes toward the drop.
export const ICE_ZONES = [
  { kind: 'stream' },
  { kind: 'disc', x: LEVEL.ledgeIce.x, z: LEVEL.ledgeIce.z, radius: LEVEL.ledgeIce.radius, driftX: LEVEL.ledgeIce.rx, driftZ: LEVEL.ledgeIce.rz, drift: 1.1 },
]
