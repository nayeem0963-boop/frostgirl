import { useMemo } from 'react'
import {
  BufferAttribute, Color, ConeGeometry, CylinderGeometry, InstancedMesh, MeshStandardMaterial,
  Object3D, Group, DoubleSide,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createNoise2D, mulberry32 } from '../core/noise.js'

const nTree = createNoise2D(301)

function colorize(geo, fn) {
  const p = geo.attributes.position
  const col = new Float32Array(p.count * 3)
  const c = new Color()
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i), i)
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(col, 3))
  return geo
}

const BARK = new Color('#43352b')
const NEEDLE_DARK = new Color('#142619')
const NEEDLE = new Color('#1f3d2b')
const NEEDLE_LIGHT = new Color('#2e573d')
const SNOW = new Color('#eaf0f6')
const SNOW_SHADE = new Color('#c2d1e1')
const _s = new Color()

/** A slender snow-dusted spruce, ~10 m tall, with drooping star-shaped whorls. */
function createPine(seed, tiers = 13) {
  const rand = mulberry32(seed)
  const H = 10
  const parts = []
  const trunk = new CylinderGeometry(0.07, 0.24, H * 0.55, 7).translate(0, H * 0.27, 0)
  parts.push(colorize(trunk, (c) => c.copy(BARK)))
  const lobes = 6 + (seed % 3)
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1)
    const radius = (H * 0.2 * Math.pow(1 - t, 1.05) + 0.22) * (0.85 + rand() * 0.3)
    const height = radius * 0.8 + 0.55
    const y = H * (0.1 + 0.86 * t)
    const geo = new ConeGeometry(radius, height, 10, 2, true)
    const p = geo.attributes.position
    const ph = rand() * 10
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v)
      const z = p.getZ(v)
      const vy = p.getY(v)
      const ang = Math.atan2(z, x)
      const rel = Math.hypot(x, z) / radius // 0 at apex .. 1 at rim
      const star = 1 + 0.32 * Math.max(-0.6, Math.sin(ang * lobes + ph)) * rel + 0.12 * nTree(ang * 2 + ph, i) * rel
      const droop = -rel * rel * height * 0.42
      p.setXYZ(v, x * star, vy + droop, z * star)
    }
    geo.computeVertexNormals()
    const tierSnow = 0.05 + rand() * 0.3 + t * 0.15
    colorize(geo, (c, x, vy, z, idx) => {
      const ny = geo.attributes.normal.getY(idx)
      const rel = Math.hypot(x, z) / radius
      const n = nTree(x * 1.9 + seed, z * 1.9 + i)
      c.copy(NEEDLE_DARK).lerp(NEEDLE, 0.55 + n * 0.45).lerp(NEEDLE_LIGHT, Math.max(0, n) * 0.35 + rel * 0.15)
      // Patchy snow resting on the upper surfaces, thinning toward branch tips.
      const snow = Math.min(1, Math.max(0, (n + tierSnow - 0.28 - rel * 0.25) * 3)) * (ny > 0.3 ? 1 : 0)
      if (snow > 0) { _s.copy(SNOW).lerp(SNOW_SHADE, rel * 0.35); c.lerp(_s, snow) }
    })
    geo.translate((rand() - 0.5) * 0.12, y, (rand() - 0.5) * 0.12)
    parts.push(geo)
  }
  const tip = new ConeGeometry(0.12, 1.1, 6).translate(0, H * 1.02, 0)
  parts.push(colorize(tip, (c) => c.copy(NEEDLE)))
  const merged = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g }))
  merged.computeBoundingSphere()
  return merged
}

function createFarPine() {
  const parts = []
  for (let i = 0; i < 3; i++) {
    const t = i / 2
    const r = 2.8 * (1 - t * 0.6)
    const g = new ConeGeometry(r, r * 1.6, 7).translate(0, 2.2 + i * 2.6, 0)
    colorize(g, (c, x, y, z, idx) => {
      const ny = g.attributes.normal.getY(idx)
      c.copy(NEEDLE).lerp(SNOW, ny > 0.45 ? 0.75 : 0.1)
    })
    parts.push(g)
  }
  const m = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g }))
  m.computeBoundingSphere()
  return m
}

const CHUNK = 64

function buildChunks(items, geometries, material, { shadows }) {
  const groups = new Map()
  for (const t of items) {
    const key = `${Math.floor(t.x / CHUNK)},${Math.floor(t.z / CHUNK)},${t.v ?? 0}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(t)
  }
  const root = new Group()
  const dummy = new Object3D()
  for (const [key, list] of groups) {
    const v = Number(key.split(',')[2])
    const mesh = new InstancedMesh(geometries[v], material, list.length)
    list.forEach((t, i) => {
      dummy.position.set(t.x, t.y - 0.3, t.z)
      dummy.rotation.set(t.lean ?? 0, t.r, (t.lean ?? 0) * 0.7)
      const w = t.s * (0.92 + ((i * 7) % 5) * 0.04)
      dummy.scale.set(w, t.s * 1.08, w)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
    root.add(mesh)
  }
  return root
}

export function Forest({ world, quality }) {
  const group = useMemo(() => {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: DoubleSide })
    const near = buildChunks(world.scatter.trees, [createPine(7), createPine(20, 11)], mat, { shadows: quality !== 'low' })
    const farMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
    const far = buildChunks(world.scatter.farTrees, [createFarPine()], farMat, { shadows: false })
    const g = new Group()
    g.add(near, far)
    return g
  }, [world, quality])
  return <primitive object={group} />
}
