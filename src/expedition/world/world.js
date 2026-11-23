// Builds the shared world model: terrain grid, scatter (trees, rocks,
// markers) and the collider spatial hash. Rendering and gameplay both read
// from this one object so visuals and physics always agree.
import { buildTerrainGrid, createSampler, surfaceAt, NEAR_BOUNDS } from './terrain.js'
import { nearestTrail, TRAIL_LENGTH, trailPoint } from './trail.js'
import { LEVEL, streamDistance, TRAIL_BOULDERS, SNOWBANKS } from './level.js'
import { createNoise2D, fbm, mulberry32 } from '../core/noise.js'

const nT = createNoise2D(71)
const nR = createNoise2D(83)
const nStand = createNoise2D(151) // forest stands: neighbouring trees share age/size
const nMeadow = createNoise2D(167) // natural openings in the forest

// Meshy spruce variants (see scripts/build-expedition-assets.mjs "spruces"):
// 0-3 mature, clear lower trunk; 4-7 younger, fuller to the ground.
export const SPRUCE_VARIANTS = 8
const MATURE = [0, 1, 2, 3]
const YOUNG = [4, 5, 6, 7]

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
  // `rand` is shared with the rock placement below. To keep every rock (and
  // its collider) where it was, `legacyDraws` replays the exact rand() calls
  // of the original tree loop; all new tree attributes use `treeRand`.
  const treeRand = mulberry32(4321)
  const sp = 4.2
  const accept = (px, pz) => {
    nearestTrail(px, pz, t)
    if (t.d < 5.2) return false
    const ledge = t.s > LEVEL.ledge.s0 - 8 && t.s < LEVEL.ledge.s1 + 8
    if (ledge && t.side > 0 && t.side < 30) return false
    if (streamDistance(px, pz) < 4.5) return false
    if (inClearing(clear, px, pz)) return false
    sampler.normal(px, pz, n)
    return n.y >= 0.8
  }
  const groveDensity = (px, pz) => fbm(nT, px / 45, pz / 45, 3) + 0.25 - (t.s / TRAIL_LENGTH) * 0.55 + (t.d < 12 ? 0.18 : 0)
  for (let z = NEAR_BOUNDS.minZ + 2; z < NEAR_BOUNDS.maxZ - 2; z += sp) {
    for (let x = NEAR_BOUNDS.minX + 2; x < NEAR_BOUNDS.maxX - 2; x += sp) {
      const lx = x + (rand() - 0.5) * sp * 0.95
      const lz = z + (rand() - 0.5) * sp * 0.95
      // Legacy rand() bookkeeping (grove threshold + 4 attribute draws).
      if (accept(lx, lz) && groveDensity(lx, lz) >= 0.05 + rand() * 0.25) { rand(); rand(); rand(); rand() }

      // New placement: noise displacement breaks up residual grid rows.
      const px = lx + nStand(x / 9, z / 9) * 1.3
      const pz = lz + nStand(z / 9 + 40, x / 9) * 1.3
      if (!accept(px, pz)) continue
      if (groveDensity(px, pz) < 0.05 + treeRand() * 0.25) continue
      // Natural openings away from the trail.
      if (t.d > 14 && fbm(nMeadow, px / 60, pz / 60, 2) < -0.32) continue
      // Forest edge along the trail: sparser, so the corridor stays readable.
      if (t.d < 9 && treeRand() < 0.45) continue
      // Height in metres: smaller near the trail, taller stands further out;
      // neighbouring trees share a stand age so sizes vary in patches.
      const altitudeThin = t.s / TRAIL_LENGTH
      const stand = 0.85 + 0.3 * (fbm(nStand, px / 38, pz / 38, 2) + 0.5)
      const base = t.d < 10 ? 8 + treeRand() * 4 : t.d < 25 ? 10 + treeRand() * 7 : 13 + treeRand() * 10
      let h = base * stand * (1 - altitudeThin * 0.2)
      // Keep crowns (radius ~0.22 h) from overhanging the trail corridor.
      const maxH = (t.d - 4.6) / 0.22
      if (maxH < 6) continue
      if (h > maxH) h = maxH * (0.9 + treeRand() * 0.1)
      const pool = t.d < 12 ? MATURE : treeRand() < 0.55 ? MATURE : YOUNG
      const v = pool[Math.floor(treeRand() * pool.length)]
      const y = sampler.height(px, pz)
      trees.push({ x: px, y, z: pz, h, s: h / 10, r: treeRand() * Math.PI * 2, v, lean: (treeRand() - 0.5) * 0.05 })
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
    const fs = 0.9 + rand() * 0.9
    farTrees.push({ x: px, y, z: pz, h: 9 + fs * 8, s: fs, r: rand() * 6.28, v: Math.floor(treeRand() * SPRUCE_VARIANTS) })
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

  return { trees, farTrees, rocks, markers }
}

function buildColliders(sampler, sc) {
  const list = []
  for (const t of sc.trees) {
    // Trunk collider (Meshy spruce trunks are ~2% of tree height in radius).
    // `size` = height / 10 feeds the camera's foliage-cone avoidance.
    list.push({ x: t.x, z: t.z, radius: 0.022 * t.h + 0.12, top: t.y + t.h, kind: 'tree', base: t.y, size: t.h / 10 })
  }
  for (const r of sc.rocks) {
    if (r.s < 0.35) continue
    const h = r.s * (r.hScale ?? 0.62)
    list.push({ x: r.x, z: r.z, radius: r.s * 0.92, top: r.y + h, kind: 'rock' })
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
