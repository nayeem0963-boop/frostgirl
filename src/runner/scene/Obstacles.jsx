// Visuals for the obstacle pool. The meshes are decoration only: collision
// uses the independent boxes in config.js / sim.js. One InstancedMesh per kind.
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, InstancedMesh, MeshStandardMaterial,
  Object3D, SphereGeometry, PlaneGeometry, CanvasTexture, MeshBasicMaterial, SRGBColorSpace, DoubleSide, AdditiveBlending,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LANES, OBSTACLES, SHARD } from '../config.js'
import { POOL, shardFall } from '../sim/sim.js'

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

// World 03's crystal spire cluster (collider: 1.5 m wide, 2 m high, see OBSTACLES.shard). It falls from SHARD.height to the ground.
function crystalSpire() {
  const d = OBSTACLES.shard
  const h = d.y1 * 1.5 // drawn taller than its 2 m collider: easier to read, and never unfair (the collider is the smaller one)
  return mergeGeometries([
    part(new ConeGeometry(0.62, h, 6), '#8678f2', 0, h / 2, 0),
    part(new ConeGeometry(0.34, h * 0.62, 5), '#b8acff', -0.46, h * 0.31, 0.1, 0, 0, 0.18),
    part(new ConeGeometry(0.3, h * 0.5, 5), '#d3cbff', 0.46, h * 0.25, -0.08, 0, 0, -0.2),
    part(new BoxGeometry(1.5, 0.24, 1.0), '#4f44c4', 0, 0.12, 0), // dark base slab
  ])
}

// The warning ring where a shard will land: shown from far away, pulsing, until it has landed.
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(64, 64, 14, 64, 64, 62)
  gr.addColorStop(0, 'rgba(160,140,255,0.15)'); gr.addColorStop(0.7, 'rgba(170,150,255,0.55)'); gr.addColorStop(0.86, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(160,140,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace
  return t
}

// Ground telegraphs: amber chevrons pointing up = jump, blue chevrons pointing down = duck, laid in every lane 8 m before the obstacle.
function chevronTexture(up, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128
  const g = c.getContext('2d')
  g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color
  for (let i = 0; i < 3; i++) { // one chevron stack per lane
    const cx = 64 + i * 64
    for (const dy of [0, 34]) {
      g.beginPath()
      if (up) { g.moveTo(cx - 24, 44 + dy); g.lineTo(cx, 18 + dy); g.lineTo(cx + 24, 44 + dy) }
      else { g.moveTo(cx - 24, 18 + dy); g.lineTo(cx, 44 + dy); g.lineTo(cx + 24, 18 + dy) }
      g.stroke()
    }
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace
  return t
}

function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31)
  gr.addColorStop(0, 'rgba(20,40,80,0.7)'); gr.addColorStop(1, 'rgba(20,40,80,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace
  return t
}

const SHADOW = { wall: [2.7, 1.9], ridge: [7.6, 1.7], arch: [7.2, 1.9], wolf: [1.9, 2.0], shard: [2.1, 1.8] } // footprint under each obstacle
const MARK_AHEAD = 8

export function Obstacles({ sim }) {
  const { group, meshes, marks, shadow } = useMemo(() => {
    const mat = new MeshStandardMaterial({
      vertexColors: true, roughness: 0.22, metalness: 0.05, flatShading: true,
      emissive: new Color('#2f78b8'), emissiveIntensity: 0.5,
    })
    const geos = { wall: iceWall(), ridge: fallenPine(), arch: iceArch(), shard: crystalSpire() }
    const meshes = {}
    const group = new Object3D()
    for (const [k, geo] of Object.entries(geos)) {
      const m = new InstancedMesh(geo, mat, POOL)
      m.frustumCulled = false
      m.count = 0
      group.add(m)
      meshes[k] = m
    }
    const flat = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const markMat = (map) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: DoubleSide })
    const marks = {
      ridge: new InstancedMesh(flat, markMat(chevronTexture(true, '#ff9d1c')), POOL),
      arch: new InstancedMesh(flat, markMat(chevronTexture(false, '#1f78d1')), POOL),
      beam: new InstancedMesh(new BoxGeometry(0.5, 16, 0.5).translate(0, 8, 0), new MeshBasicMaterial({ color: '#9a86ff', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }), POOL),
      shard: new InstancedMesh(flat, new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, side: DoubleSide }), POOL),
    }
    const shadow = new InstancedMesh(flat, markMat(softTexture()), POOL)
    for (const m of [...Object.values(marks), shadow]) { m.frustumCulled = false; m.count = 0; m.renderOrder = 1; group.add(m) }
    return { group, meshes, marks, shadow }
  }, [])
  const tmp = useMemo(() => new Object3D(), [])
  useFrame(({ clock }) => {
    const s = sim.current
    const n = { wall: 0, ridge: 0, arch: 0, wolf: 0, shard: 0 }
    let sh = 0
    const span = LANES[2] * 2 + 2.2
    for (const o of s.obstacles) {
      if (!o.active) continue
      const ahead = o.dist - s.dist
      const z = -ahead
      tmp.position.set(o.x, 0, z)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(1, 1, 1)
      let landed = true
      if (o.kind === 'shard') { // falls from the sky while 34 -> 16 m ahead, tilting and turning, then stands
        const p = shardFall(ahead)
        landed = p >= 1
        tmp.position.y = SHARD.height * (1 - p * p)
        tmp.rotation.set(0, p * 5, (1 - p) * 0.4)
      }
      tmp.updateMatrix()
      if (meshes[o.kind]) meshes[o.kind].setMatrixAt(n[o.kind]++, tmp.matrix) // (a wolf has no instanced mesh: scene/Wolves.jsx draws it)
      if (!landed) continue // no footprint under a falling shard
      tmp.rotation.set(0, 0, 0)
      const [w, d] = SHADOW[o.kind]
      tmp.position.set(o.x, 0.03, z)
      tmp.scale.set(w, 1, d)
      tmp.updateMatrix()
      shadow.setMatrixAt(sh++, tmp.matrix)
    }
    for (const k in meshes) { meshes[k].count = n[k]; meshes[k].instanceMatrix.needsUpdate = true }
    shadow.count = sh; shadow.instanceMatrix.needsUpdate = true
    let mr = 0, ma = 0, ms = 0, mb = 0
    for (const o of s.obstacles) {
      if (!o.active || o.kind === 'wall' || o.kind === 'wolf') continue
      const ahead = o.dist - s.dist
      if (o.kind === 'shard') { // pulsing ring on the lane, until the spire has landed
        if (shardFall(ahead) >= 1) continue
        const pulse = 3.6 * (0.92 + 0.12 * Math.sin(clock.elapsedTime * 7 + o.id))
        tmp.rotation.set(0, 0, 0)
        tmp.position.set(o.x, 0.04, -ahead)
        tmp.scale.set(pulse, 1, pulse)
        tmp.updateMatrix()
        marks.shard.setMatrixAt(ms++, tmp.matrix)
        tmp.position.set(o.x, 0, -ahead) // and a tall beam of light over the lane, readable from far away
        tmp.scale.set(1, 1, 1)
        tmp.updateMatrix()
        marks.beam.setMatrixAt(mb++, tmp.matrix)
        continue
      }
      tmp.rotation.set(0, 0, 0)
      tmp.position.set(0, 0.035, -ahead - MARK_AHEAD)
      tmp.scale.set(span, 1, 2.6)
      tmp.updateMatrix()
      if (o.kind === 'ridge') marks.ridge.setMatrixAt(mr++, tmp.matrix)
      else marks.arch.setMatrixAt(ma++, tmp.matrix)
    }
    marks.ridge.count = mr; marks.ridge.instanceMatrix.needsUpdate = true
    marks.arch.count = ma; marks.arch.instanceMatrix.needsUpdate = true
    marks.shard.count = ms; marks.shard.instanceMatrix.needsUpdate = true
    marks.beam.count = mb; marks.beam.instanceMatrix.needsUpdate = true
  })
  return <primitive object={group} />
}
