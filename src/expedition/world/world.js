// Builds the shared world model: terrain grid, scatter (trees, rocks,
// markers) and the collider spatial hash. Rendering and gameplay both read
// from this one object so visuals and physics always agree.
import { buildTerrainGrid, createSampler, surfaceAt, NEAR_BOUNDS } from './terrain.js'
import { nearestTrail, TRAIL_LENGTH, trailPoint } from './trail.js'
import { LEVEL, streamDistance, TRAIL_BOULDERS, SNOWBANKS } from './level.js'
import { createNoise2D, fbm, mulberry32 } from '../core/noise.js'

const nT = createNoise2D(71)
const nR = createNoise2D(83)

function clearings() {
  return [
    { x: LEVEL.start.x, z: LEVEL.start.z, r: 8 },
    { x: LEVEL.checkpoint.x, z: LEVEL.checkpoint.z, r: 14 },
    { x: LEVEL.wolf.x, z: LEVEL.wolf.z, r: LEVEL.wolf.radius + 3 },
    { x: LEVEL.frostStone.x, z: LEVEL.frostStone.z, r: 7 },
  ]
}

function inClearing(list, x, z) {
  for (const c of list) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true
  return false
}

function scatter(sampler) {
  const rand = mulberry32(1234)
  const trees = []
  const farTrees = []
  const rocks = []
  const clear = clearings()
  const t = { d: 0, s: 0, side: 0 }
  const n = { x: 0, y: 1, z: 0 }

  // Near forest: jittered grid with noise-driven density (irregular groves).
  const sp = 4.2
  for (let z = NEAR_BOUNDS.minZ + 2; z < NEAR_BOUNDS.maxZ - 2; z += sp) {
    for (let x = NEAR_BOUNDS.minX + 2; x < NEAR_BOUNDS.maxX - 2; x += sp) {
      const px = x + (rand() - 0.5) * sp * 0.95
      const pz = z + (rand() - 0.5) * sp * 0.95
      nearestTrail(px, pz, t)
      if (t.d < 5.2) continue
      const ledge = t.s > LEVEL.ledge.s0 - 8 && t.s < LEVEL.ledge.s1 + 8
      if (ledge && t.side > 0 && t.side < 30) continue
      if (streamDistance(px, pz) < 4.5) continue
      if (inClearing(clear, px, pz)) continue
      sampler.normal(px, pz, n)
      if (n.y < 0.8) continue
      // Groves: density noise + more trees in the lower forest, thinning uphill.
      const altitudeThin = t.s / TRAIL_LENGTH
      const grove = fbm(nT, px / 45, pz / 45, 3) + 0.25 - altitudeThin * 0.55
      const edgeBoost = t.d < 12 ? 0.18 : 0
      if (grove + edgeBoost < 0.05 + rand() * 0.25) continue
      const y = sampler.height(px, pz)
      const size = 0.65 + rand() * 0.7 + (t.d > 20 ? 0.25 : 0)
      trees.push({ x: px, y, z: pz, s: size, r: rand() * Math.PI * 2, v: rand() < 0.5 ? 0 : 1, lean: (rand() - 0.5) * 0.06 })
    }
  }

  // Far forest on the valley walls (cheap impostor-like geometry).
  for (let i = 0; i < 9000 && farTrees.length < 3200; i++) {
    const a = rand() * Math.PI * 2
    const r = 110 + Math.pow(rand(), 0.8) * 650
    const px = Math.cos(a) * r * 1.1
    const pz = Math.sin(a) * r
    if (px > NEAR_BOUNDS.minX && px < NEAR_BOUNDS.maxX && pz > NEAR_BOUNDS.minZ && pz < NEAR_BOUNDS.maxZ) continue
    sampler.normal(px, pz, n)
    if (n.y < 0.82) continue
    const y = sampler.height(px, pz)
    if (y > 200 + fbm(nT, px / 90, pz / 90, 2) * 40) continue // tree line
    if (fbm(nT, px / 70, pz / 70, 3) < -0.05) continue
    farTrees.push({ x: px, y, z: pz, s: 0.9 + rand() * 0.9, r: rand() * 6.28 })
  }

  // Rocks: trailside stones, slope boulders, ravine rim.
  for (let i = 0; i < 4200 && rocks.length < 650; i++) {
    const px = NEAR_BOUNDS.minX + rand() * (NEAR_BOUNDS.maxX - NEAR_BOUNDS.minX)
    const pz = NEAR_BOUNDS.minZ + rand() * (NEAR_BOUNDS.maxZ - NEAR_BOUNDS.minZ)
    nearestTrail(px, pz, t)
    if (t.d < 2.7) continue
    if (inClearing(clear, px, pz) && t.d > 3) continue
    sampler.normal(px, pz, n)
    const steep = 1 - n.y
    const nearTrail = t.d < 7 ? 0.35 : 0
    const ledge = t.s > LEVEL.ledge.s0 && t.s < LEVEL.ledge.s1 && Math.abs(t.side) < 14 ? 0.4 : 0
    const p = steep * 2.2 + nearTrail + ledge + Math.max(0, fbm(nR, px / 30, pz / 30, 2)) * 0.5
    if (rand() > p) continue
    const size = (t.d < 7 ? 0.25 + rand() * 0.6 : 0.4 + Math.pow(rand(), 2) * 2.6)
    const y = sampler.height(px, pz)
    rocks.push({ x: px, y, z: pz, s: size, r: rand() * 6.28, v: Math.floor(rand() * 3), tilt: rand() })
  }

  // Trail boulders (hazard) are hand-placed.
  for (const b of TRAIL_BOULDERS) {
    rocks.push({ x: b.x, y: sampler.height(b.x, b.z), z: b.z, s: b.radius, hScale: b.h / b.radius, r: b.seed, v: b.seed % 3, tilt: 0.2, hazard: true })
  }

  // Orange-topped trail marker posts.
  const markers = []
  for (let s = 16, k = 0; s < TRAIL_LENGTH - 10; s += 21, k++) {
    const p = trailPoint(s)
    const side = k % 2 ? 1 : -1
    const x = p.x + -p.tz * side * 2.5
    const z = p.z + p.tx * side * 2.5
    markers.push({ x, z, y: sampler.height(x, z), r: Math.atan2(p.tx, p.tz) })
  }

  // Groves of the scanned Snow Pine Forest asset (placed in Distant.jsx).
  const groves = []
  const grand = mulberry32(77)
  for (let tries = 0; groves.length < 12 && tries < 2000; tries++) {
    const x = -90 + grand() * 180
    const z = -200 + grand() * 400
    nearestTrail(x, z, t)
    if (t.d < 11 || t.d > 60) continue
    if (inClearing(clear, x, z)) continue
    const ledge = t.s > LEVEL.ledge.s0 - 8 && t.s < LEVEL.ledge.s1 + 8 && t.side > 0
    if (ledge || streamDistance(x, z) < 10) continue
    if (groves.some((g) => Math.hypot(g.x - x, g.z - z) < 38)) continue
    sampler.normal(x, z, n)
    if (n.y < 0.85) continue
    const s = 10 + grand() * 4
    groves.push({ x, z, y: sampler.height(x, z), s, sx: 0.9 + grand() * 0.2, sy: 0.9 + grand() * 0.25, sz: 0.9 + grand() * 0.2, r: grand() * Math.PI * 2 })
  }

  return { trees, farTrees, rocks, markers, groves }
}

function buildColliders(sampler, sc) {
  const list = []
  for (const t of sc.trees) {
    list.push({ x: t.x, z: t.z, radius: 0.28 * t.s + 0.12, top: t.y + 50, kind: 'tree', base: t.y, size: t.s })
  }
  for (const r of sc.rocks) {
    if (r.s < 0.35) continue
    const h = r.s * (r.hScale ?? 0.62)
    list.push({ x: r.x, z: r.z, radius: r.s * 0.92, top: r.y + h, kind: 'rock' })
  }
  for (const g of sc.groves) {
    // The grove's trunks sit within ~45% of its footprint.
    list.push({ x: g.x, z: g.z, radius: g.s * 0.45, top: g.y + 60, kind: 'tree' })
  }
  for (const b of SNOWBANKS) {
    list.push({ x: b.x, z: b.z, radius: b.radius, top: sampler.height(b.x, b.z) + b.h, kind: 'snowbank' })
  }
  // Frost stone
  const fs = LEVEL.frostStone
  list.push({ x: fs.x, z: fs.z, radius: 1.3, top: sampler.height(fs.x, fs.z) + 2.6, kind: 'rock' })
  // Checkpoint cairn
  list.push({ x: LEVEL.checkpoint.x + LEVEL.checkpoint.rx * 3.2, z: LEVEL.checkpoint.z + LEVEL.checkpoint.rz * 3.2, radius: 0.8, top: 99999, kind: 'cairn' })

  const CELL = 6
  const hash = new Map()
  const key = (i, j) => i * 100003 + j
  for (const c of list) {
    // Trees are hashed by their foliage footprint so the camera can avoid it.
    const hr = c.size ? Math.max(c.radius, c.size * 1.6) : c.radius
    const i0 = Math.floor((c.x - hr) / CELL)
    const i1 = Math.floor((c.x + hr) / CELL)
    const j0 = Math.floor((c.z - hr) / CELL)
    const j1 = Math.floor((c.z + hr) / CELL)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j)
      if (!hash.has(k)) hash.set(k, [])
      hash.get(k).push(c)
    }
  }
  const empty = []
  const query = (x, z) => hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? empty
  return { list, query }
}

let cached = null

export function getWorld() {
  if (cached) return cached
  const t0 = performance.now()
  const grid = buildTerrainGrid()
  const sampler = createSampler(grid)
  const sc = scatter(sampler)
  const colliders = buildColliders(sampler, sc)
  const startY = sampler.height(LEVEL.start.x, LEVEL.start.z)
  cached = {
    grid,
    height: sampler.height,
    normal: sampler.normal,
    surface: surfaceAt,
    colliders: colliders.query,
    colliderList: colliders.list,
    scatter: sc,
    start: { ...LEVEL.start, y: startY },
    checkpointY: sampler.height(LEVEL.checkpoint.x, LEVEL.checkpoint.z),
    buildMs: performance.now() - t0,
  }
  return cached
}
