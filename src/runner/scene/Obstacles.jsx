// Visuals for the obstacle pool. The meshes are decoration only: collision
// uses the independent boxes in config.js / sim.js. One InstancedMesh per kind.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BoxGeometry, BufferAttribute, Color, ConeGeometry, CylinderGeometry, InstancedMesh, MeshStandardMaterial,
  Object3D, SphereGeometry, PlaneGeometry, CanvasTexture, MeshBasicMaterial, SRGBColorSpace, DoubleSide, AdditiveBlending,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LANES, OBSTACLES, SHARD } from '../config.js'
import { POOL, shardFall, holeOpen } from '../sim/sim.js'

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

// World 04's cracking ice: the footprint of a hole is 2.0 m x 1.8 m (collider 1.8 x 1.6). First the lane shows cracks, then it breaks
// open into dark water with an icy rim.
function jagged(g, cx, cy, rx, ry, seed) {
  let a = seed
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647)
  g.beginPath()
  const n = 22
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const k = 0.82 + rnd() * 0.22
    const x = cx + Math.cos(t) * rx * k, y = cy + Math.sin(t) * ry * k
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
  }
  g.closePath()
}
function crackTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')
  const halo = g.createRadialGradient(128, 128, 20, 128, 128, 120)
  halo.addColorStop(0, 'rgba(30,100,200,0.62)'); halo.addColorStop(0.6, 'rgba(30,100,200,0.3)'); halo.addColorStop(1, 'rgba(30,100,200,0)')
  g.fillStyle = halo; g.fillRect(0, 0, 256, 256)
  let a = 7
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647)
  g.lineCap = 'round'; g.lineJoin = 'round'
  for (let i = 0; i < 9; i++) { // jagged cracks radiating from the middle
    const ang = (i / 9) * Math.PI * 2 + rnd() * 0.5
    let x = 128, y = 128
    g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < 6; k++) { const len = 14 + rnd() * 16; const aa = ang + (rnd() - 0.5) * 0.9; x += Math.cos(aa) * len; y += Math.sin(aa) * len; g.lineTo(x, y) }
    g.strokeStyle = 'rgba(20,70,150,0.95)'; g.lineWidth = 5; g.stroke()
    g.strokeStyle = 'rgba(235,248,255,0.95)'; g.lineWidth = 1.8; g.stroke()
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace
  return t
}
function waterTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')
  jagged(g, 128, 128, 120, 110, 11); g.fillStyle = '#eaf6ff'; g.fill() // icy rim
  jagged(g, 128, 128, 102, 92, 5)
  const w = g.createRadialGradient(110, 100, 10, 128, 128, 110)
  w.addColorStop(0, '#1f6fb8'); w.addColorStop(1, '#082a55')
  g.fillStyle = w; g.fill()
  g.strokeStyle = 'rgba(160,215,255,0.5)'; g.lineWidth = 2 // ripples
  for (const r of [26, 46, 66]) { g.beginPath(); g.ellipse(120, 118, r, r * 0.8, 0, 0.2, 2.4); g.stroke() }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace
  return t
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

const SHADOW = { wall: [2.7, 1.9], ridge: [7.6, 1.7], arch: [7.2, 1.9], wolf: [1.9, 2.0], shard: [2.1, 1.8], hole: null } // (a hole has no footprint: it is one) // footprint under each obstacle
const MARK_AHEAD = 8

export function Obstacles({ sim, highContrast = false }) {
  const { group, meshes, marks, shadow, mat } = useMemo(() => {
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
      crack: new InstancedMesh(flat, markMat(crackTexture()), POOL),
      iceBeam: new InstancedMesh(new BoxGeometry(0.4, 9, 0.4).translate(0, 4.5, 0), new MeshBasicMaterial({ color: '#5cd6ff', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }), POOL),
      water: new InstancedMesh(flat, markMat(waterTexture()), POOL),
      beam: new InstancedMesh(new BoxGeometry(0.5, 16, 0.5).translate(0, 8, 0), new MeshBasicMaterial({ color: '#9a86ff', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }), POOL),
      shard: new InstancedMesh(flat, new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, side: DoubleSide }), POOL),
    }
    const shadow = new InstancedMesh(flat, markMat(softTexture()), POOL)
    for (const m of [...Object.values(marks), shadow]) { m.frustumCulled = false; m.count = 0; m.renderOrder = 1; group.add(m) }
    return { group, meshes, marks, shadow, mat }
  }, [])
  // high-contrast setting: a warm amber glow on walls, pines, arches and spires (distinct from snow and ice in luminance and hue)
  useEffect(() => { mat.emissive.set(highContrast ? '#ffa81f' : '#2f78b8'); mat.emissiveIntensity = highContrast ? 0.85 : 0.5 }, [mat, highContrast])
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
      if (!SHADOW[o.kind]) continue
      const [w, d] = SHADOW[o.kind]
      tmp.position.set(o.x, 0.03, z)
      tmp.scale.set(w, 1, d)
      tmp.updateMatrix()
      shadow.setMatrixAt(sh++, tmp.matrix)
    }
    for (const k in meshes) { meshes[k].count = n[k]; meshes[k].instanceMatrix.needsUpdate = true }
    shadow.count = sh; shadow.instanceMatrix.needsUpdate = true
    let mr = 0, ma = 0, ms = 0, mb = 0, mc = 0, mw = 0, mi = 0
    for (const o of s.obstacles) {
      if (!o.active || o.kind === 'wall' || o.kind === 'wolf') continue
      const ahead = o.dist - s.dist
      if (o.kind === 'hole') { // cracks first, then dark water with an icy rim breaks open (decals on the trail)
        const open = holeOpen(ahead)
        tmp.rotation.set(0, 0, 0)
        tmp.position.set(o.x, 0.05, -ahead)
        if (open < 0.7) { // the cracking patch is drawn bigger than the hole and gets a faint cyan column of light, so it reads from far away
          const pulse = 3.2 * (0.95 + 0.07 * Math.sin(clock.elapsedTime * 6 + o.id))
          tmp.scale.set(pulse, 1, pulse * 0.95); tmp.updateMatrix(); marks.crack.setMatrixAt(mc++, tmp.matrix)
          tmp.position.y = 0; tmp.scale.set(1, 1, 1); tmp.updateMatrix(); marks.iceBeam.setMatrixAt(mi++, tmp.matrix); tmp.position.y = 0.05
        }
        if (open > 0) { const k = 0.55 + 0.45 * open; tmp.position.y = 0.06; tmp.scale.set(2.05 * k, 1, 1.85 * k); tmp.updateMatrix(); marks.water.setMatrixAt(mw++, tmp.matrix) }
        continue
      }
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
    marks.crack.count = mc; marks.crack.instanceMatrix.needsUpdate = true
    marks.iceBeam.count = mi; marks.iceBeam.instanceMatrix.needsUpdate = true
    marks.water.count = mw; marks.water.instanceMatrix.needsUpdate = true
  })
  return <primitive object={group} />
}
