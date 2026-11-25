// The snowy trail: a packed-snow running surface with three readable lanes,
// flanked by snow banks. Geometry is static; the texture scrolls with the run.
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { CanvasTexture, PlaneGeometry, RepeatWrapping, SRGBColorSpace } from 'three'
import { LANES, LANE_WIDTH, TRAIL_HALF_WIDTH } from '../config.js'
import { groundY } from './scenery.js'

const TILE = 8 // metres of trail per texture repeat
const LENGTH = 420
const CENTER_Z = -(LENGTH / 2) + 40

function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

function trailTexture() {
  const W = 256, H = 256
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#d3e1f0'; g.fillRect(0, 0, W, H) // packed snow: a touch darker and bluer than the powder around it
  const r = rng(11)
  // packed ruts (darker) and sparkle
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${150 + r() * 40},${175 + r() * 35},${205 + r() * 30},${0.05 + r() * 0.08})`
    g.fillRect(r() * W, r() * H, 1 + r() * 5, 1 + r() * 14)
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.4})`
    g.fillRect(r() * W, r() * H, 1, 1)
  }
  // soft shoulder shading so the trail separates from the snow beside it
  const sh = g.createLinearGradient(0, 0, W, 0)
  sh.addColorStop(0, 'rgba(120,160,205,0.45)'); sh.addColorStop(0.09, 'rgba(120,160,205,0)'); sh.addColorStop(0.91, 'rgba(120,160,205,0)'); sh.addColorStop(1, 'rgba(120,160,205,0.45)')
  g.fillStyle = sh; g.fillRect(0, 0, W, H)
  // lane dividers and glowing edge rails (u across the TRAIL width)
  const u = (x) => ((x + TRAIL_HALF_WIDTH) / (TRAIL_HALF_WIDTH * 2)) * W
  g.fillStyle = 'rgba(70,130,205,0.6)'
  const half = LANE_WIDTH / 2
  for (const x of [-half, half]) for (let y = 0; y < H; y += 64) g.fillRect(u(x) - 1.5, y, 3, 36) // dashed
  g.fillStyle = 'rgba(55,115,200,0.65)'
  for (const x of [-(LANES[2] + half), LANES[2] + half]) g.fillRect(u(x) - 2, 0, 4, H) // solid outer rails
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

function snowTexture() {
  const W = 256, H = 256
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#f2f6fb'; g.fillRect(0, 0, W, H)
  const r = rng(29)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${170 + r() * 50},${195 + r() * 40},${225 + r() * 25},${0.05 + r() * 0.09})`
    g.beginPath(); g.ellipse(r() * W, r() * H, 3 + r() * 14, 2 + r() * 6, r() * 3, 0, 6.3); g.fill()
  }
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.4})`; g.fillRect(r() * W, r() * H, 1, 1) }
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

function terrainGeometry() {
  const width = 400, segX = 100
  const g = new PlaneGeometry(width, LENGTH, segX, 1)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    p.setY(i, groundY(p.getX(i)) - 0.02)
    uv.setXY(i, p.getX(i) / TILE, -p.getZ(i) / TILE)
  }
  g.computeVertexNormals()
  return g
}

export function Ground({ sim }) {
  const { trailMap, snowMap, side, trailGeo } = useMemo(() => {
    const trailMap = trailTexture()
    trailMap.repeat.set(1, LENGTH / TILE)
    const snowMap = snowTexture()
    snowMap.repeat.set(1, 1)
    const trailGeo = new PlaneGeometry(TRAIL_HALF_WIDTH * 2, LENGTH)
    trailGeo.rotateX(-Math.PI / 2)
    return { trailMap, snowMap, side: terrainGeometry(), trailGeo }
  }, [])
  useFrame(() => {
    const d = sim.current.dist
    // features must move toward the camera (+z): their v coordinate shrinks as the run advances
    trailMap.offset.y = -d / TILE
    snowMap.offset.y = -d / TILE
  })
  return (
    <group position={[0, 0, CENTER_Z]}>
      <mesh geometry={side} receiveShadow>
        <meshStandardMaterial map={snowMap} color="#ffffff" roughness={0.95} metalness={0} />
      </mesh>
      <mesh geometry={trailGeo} position={[0, 0.012, 0]} receiveShadow>
        <meshStandardMaterial map={trailMap} roughness={0.85} metalness={0} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  )
}
