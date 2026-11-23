import { useMemo } from 'react'
import { BufferAttribute, Color, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { createNoise2D } from '../core/noise.js'

const ROCK_A = new Color('#5f636b')
const ROCK_B = new Color('#45484f')
const LICHEN = new Color('#6b6a5c')
const SNOW = new Color('#eef3f8')

/** Snow-capped boulder; base sits at y=0, top at ~0.62 (scaled per instance). */
export function createRockGeometry(seed) {
  const noise = createNoise2D(seed)
  let g = new IcosahedronGeometry(1, 3)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g = mergeVertices(g)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i)
    const n = noise(x * 1.3 + seed, z * 1.3 + y) * 0.22 + noise(x * 3.1, y * 3.1 + z) * 0.08
    // Faceted, fractured look: quantise the displacement a little.
    const f = 1 + Math.round(n * 9) / 9
    let ny = y * 0.62 * f
    if (ny < -0.1) ny = -0.1 + (ny + 0.1) * 0.3 // flattened, buried base
    p.setXYZ(i, x * f * (1 + 0.15 * Math.sin(seed)), ny + 0.1, z * f)
  }
  g.computeVertexNormals()
  const nr = g.attributes.normal
  const col = new Float32Array(p.count * 3)
  const c = new Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i)
    const n = noise(x * 4, z * 4 + y * 2)
    c.copy(ROCK_A).lerp(ROCK_B, 0.5 + n * 0.5)
    if (n > 0.45) c.lerp(LICHEN, 0.4)
    const up = nr.getY(i)
    const snow = up > 0.55 + n * 0.15 ? Math.min(1, (up - 0.5) * 3.5) : 0
    c.lerp(SNOW, snow)
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.computeBoundingSphere()
  return g
}

let shared = null
export function getRockAssets() {
  if (!shared) {
    shared = {
      geometries: [createRockGeometry(3), createRockGeometry(8), createRockGeometry(15)],
      material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true }),
    }
  }
  return shared
}

export function Rocks({ world }) {
  const meshes = useMemo(() => {
    const { geometries, material } = getRockAssets()
    const byVariant = [[], [], []]
    for (const r of world.scatter.rocks) byVariant[r.v].push(r)
    const dummy = new Object3D()
    return byVariant.map((list, v) => {
      const mesh = new InstancedMesh(geometries[v], material, list.length)
      list.forEach((r, i) => {
        dummy.position.set(r.x, r.y - r.s * 0.12, r.z)
        dummy.rotation.set((r.tilt - 0.5) * 0.3, r.r, (r.tilt - 0.5) * 0.2)
        const hs = r.hScale ? r.hScale / 0.62 : 1
        dummy.scale.set(r.s, r.s * hs, r.s * (0.8 + r.tilt * 0.4))
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.computeBoundingSphere()
      mesh.castShadow = true
      mesh.receiveShadow = true
      return mesh
    })
  }, [world])
  return meshes.map((m, i) => <primitive key={i} object={m} />)
}
