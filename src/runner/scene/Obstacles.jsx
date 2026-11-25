// Visuals for the obstacle pool. The meshes are decoration only: collision
// uses the independent boxes in config.js / sim.js. One InstancedMesh per kind.
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, InstancedMesh, MeshStandardMaterial,
  Object3D, SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { OBSTACLES } from '../config.js'
import { POOL } from '../sim/sim.js'

const _o = new Object3D()
function part(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo
  _o.position.set(x, y, z)
  _o.rotation.set(rx, ry, rz)
  _o.updateMatrix()
  g.applyMatrix4(_o.matrix)
  const c = new Color(color)
  const col = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.deleteAttribute('uv')
  return g
}

function iceWall() {
  const d = OBSTACLES.wall
  const w = d.halfW * 2
  return mergeGeometries([
    part(new BoxGeometry(w, 1.5, 0.9), '#2a86d6', 0, 0.75, 0),
    part(new BoxGeometry(w * 0.82, 0.5, 0.7), '#56b2ef', 0, 1.75, 0),
    part(new ConeGeometry(0.34, 1.0, 5), '#9bdcff', -0.52, 2.25, 0.05, 0, 0, 0.08),
    part(new ConeGeometry(0.4, 1.2, 5), '#cdeeff', 0.05, 2.45 - 0.1, -0.05, 0, 0.4, -0.05),
    part(new ConeGeometry(0.3, 0.9, 5), '#8fd6ff', 0.58, 2.2, 0.08, 0, 0.9, -0.1),
    part(new BoxGeometry(w * 1.08, 0.18, 1.1), '#f4fbff', 0, 0.09, 0), // frosted base
  ])
}

function fallenPine() {
  const len = OBSTACLES.ridge.halfW * 2
  const parts = [
    part(new CylinderGeometry(0.4, 0.43, len, 8), '#3a2b20', 0, 0.4, 0, 0, 0, Math.PI / 2),
    part(new CylinderGeometry(0.34, 0.37, len * 0.98, 8), '#f1f7fc', 0, 0.5, 0, 0, 0, Math.PI / 2), // snow crust on top
    part(new SphereGeometry(0.42, 6, 4), '#e6f4ff', -len / 2, 0.38, 0), // ice-covered broken stump ends
    part(new SphereGeometry(0.46, 6, 4), '#e6f4ff', len / 2, 0.38, 0),
  ]
  for (const x of [-2.4, -0.6, 1.5, 2.8]) parts.push(part(new ConeGeometry(0.16, 0.45, 4), '#cdeeff', x, 0.78, 0.1, 0.2, 0, 0))
  return mergeGeometries(parts)
}

function iceArch() {
  const d = OBSTACLES.arch
  const reach = d.halfW + 0.5 // posts stand just outside the outer lane rails
  const parts = [
    part(new BoxGeometry(0.9, d.y1, 0.9), '#2a86d6', -reach - 0.25, d.y1 / 2, 0),
    part(new BoxGeometry(0.9, d.y1, 0.9), '#2a86d6', reach + 0.25, d.y1 / 2, 0),
    part(new BoxGeometry(reach * 2 + 1.4, 0.7, 0.9), '#4aa8e8', 0, d.y1 - 0.5, 0),
    part(new BoxGeometry(reach * 2 + 1.0, 0.25, 1.0), '#f4fbff', 0, d.y1 - 0.05, 0),
  ]
  const n = 11
  for (let i = 0; i < n; i++) {
    const x = -d.halfW + 0.3 + (i * (d.halfW * 2 - 0.6)) / (n - 1)
    const h = 0.35 + ((i * 37) % 5) * 0.06
    parts.push(part(new ConeGeometry(0.13, h * 1.4 + 0.15, 5), '#dff4ff', x, d.y0 + (h * 1.4 + 0.15) / 2 + 0.05, 0, Math.PI, 0, 0))
  }
  return mergeGeometries(parts)
}

export function Obstacles({ sim }) {
  const { group, meshes } = useMemo(() => {
    const mat = new MeshStandardMaterial({
      vertexColors: true, roughness: 0.22, metalness: 0.05, flatShading: true,
      emissive: new Color('#2f78b8'), emissiveIntensity: 0.5,
    })
    const geos = { wall: iceWall(), ridge: fallenPine(), arch: iceArch() }
    const meshes = {}
    const group = new Object3D()
    for (const [k, geo] of Object.entries(geos)) {
      const m = new InstancedMesh(geo, mat, POOL)
      m.frustumCulled = false
      m.count = 0
      group.add(m)
      meshes[k] = m
    }
    return { group, meshes }
  }, [])
  const tmp = useMemo(() => new Object3D(), [])
  useFrame(() => {
    const s = sim.current
    const n = { wall: 0, ridge: 0, arch: 0 }
    for (const o of s.obstacles) {
      if (!o.active) continue
      tmp.position.set(o.x, 0, -(o.dist - s.dist))
      tmp.updateMatrix()
      meshes[o.kind].setMatrixAt(n[o.kind]++, tmp.matrix)
    }
    for (const k in meshes) { meshes[k].count = n[k]; meshes[k].instanceMatrix.needsUpdate = true }
  })
  return <primitive object={group} />
}

