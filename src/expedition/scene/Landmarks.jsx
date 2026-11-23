import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, InstancedMesh, MeshPhysicalMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, SphereGeometry, Color,
} from 'three'
import { LEVEL, SNOWBANKS, STREAM_POINTS } from '../world/level.js'
import { trailPoint, TRAIL_HALF_WIDTH } from '../world/trail.js'
import { makeSignTexture } from './textures.js'

const WOOD = new MeshStandardMaterial({ color: '#5b4330', roughness: 0.9 })
const WOOD_DARK = new MeshStandardMaterial({ color: '#3f2f22', roughness: 0.95 })
const PAINT = new MeshStandardMaterial({ color: '#e0662a', roughness: 0.6 })
const SNOW = new MeshStandardMaterial({ color: '#eef3f8', roughness: 0.95 })
const ICE = new MeshPhysicalMaterial({
  color: '#a9d2ea', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
  transparent: true, opacity: 0.82, envMapIntensity: 1.4,
})

function Sign({ x, y, z, yaw, lines, scale = 1 }) {
  const tex = useMemo(() => makeSignTexture(lines), [lines])
  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]} scale={scale}>
      <mesh material={WOOD_DARK} position={[-0.75, 0.9, 0]} castShadow><cylinderGeometry args={[0.07, 0.08, 1.8, 6]} /></mesh>
      <mesh material={WOOD_DARK} position={[0.75, 0.9, 0]} castShadow><cylinderGeometry args={[0.07, 0.08, 1.8, 6]} /></mesh>
      <mesh position={[0, 1.45, 0.05]} castShadow>
        <boxGeometry args={[1.8, 0.85, 0.08]} />
        <meshStandardMaterial attach="material-0" color="#4b3424" />
        <meshStandardMaterial attach="material-1" color="#4b3424" />
        <meshStandardMaterial attach="material-2" color="#e8eef4" />
        <meshStandardMaterial attach="material-3" color="#4b3424" />
        <meshStandardMaterial attach="material-4" map={tex} roughness={0.85} />
        <meshStandardMaterial attach="material-5" map={tex} roughness={0.85} />
      </mesh>
      <mesh material={SNOW} position={[0, 1.9, 0.05]} scale={[0.95, 0.06, 0.08]}><sphereGeometry args={[1, 10, 6]} /></mesh>
    </group>
  )
}

function Markers({ world }) {
  const meshes = useMemo(() => {
    const list = world.scatter.markers
    const post = new InstancedMesh(new CylinderGeometry(0.06, 0.07, 1.3, 6).translate(0, 0.55, 0), WOOD, list.length)
    const cap = new InstancedMesh(new CylinderGeometry(0.075, 0.075, 0.18, 6).translate(0, 1.12, 0), PAINT, list.length)
    const d = new Object3D()
    list.forEach((m, i) => {
      d.position.set(m.x, m.y, m.z)
      d.rotation.set(Math.sin(i) * 0.05, m.r, Math.cos(i * 3) * 0.05)
      d.updateMatrix()
      post.setMatrixAt(i, d.matrix)
      cap.setMatrixAt(i, d.matrix)
    })
    for (const m of [post, cap]) { m.castShadow = true; m.computeBoundingSphere() }
    return [post, cap]
  }, [world])
  return meshes.map((m, i) => <primitive key={i} object={m} />)
}

function Snowbanks({ world }) {
  const mesh = useMemo(() => {
    const geo = new SphereGeometry(1, 14, 8)
    const m = new InstancedMesh(geo, SNOW, SNOWBANKS.length)
    const d = new Object3D()
    SNOWBANKS.forEach((b, i) => {
      d.position.set(b.x, world.height(b.x, b.z) - 0.25, b.z)
      d.rotation.set(0, Math.atan2(b.tx, b.tz), 0)
      d.scale.set(b.radius * 1.05, b.h + 0.25, b.radius * 1.5)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.castShadow = true
    m.receiveShadow = true
    m.computeBoundingSphere()
    return m
  }, [world])
  return <primitive object={mesh} />
}

/** Ice ribbon along the frozen stream, conforming to the terrain. */
function StreamIce({ world }) {
  const geometry = useMemo(() => {
    const pts = []
    for (let i = 0; i < STREAM_POINTS.length - 1; i++) {
      const [ax, az] = STREAM_POINTS[i]
      const [bx, bz] = STREAM_POINTS[i + 1]
      for (let k = 0; k < 8; k++) pts.push([ax + (bx - ax) * k / 8, az + (bz - az) * k / 8])
    }
    pts.push(STREAM_POINTS[STREAM_POINTS.length - 1])
    const w = LEVEL.stream.halfWidth
    const pos = []
    const idx = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[Math.min(pts.length - 1, i + 1)]
      const o = pts[Math.max(0, i - 1)]
      let tx = q[0] - o[0]
      let tz = q[1] - o[1]
      const l = Math.hypot(tx, tz) || 1
      tx /= l; tz /= l
      for (const side of [-1, -0.5, 0, 0.5, 1]) {
        const x = p[0] - tz * w * side
        const z = p[1] + tx * w * side
        pos.push(x, world.height(x, z) + 0.035, z)
      }
      if (i > 0) {
        const a = (i - 1) * 5
        const b = i * 5
        for (let s = 0; s < 4; s++) idx.push(a + s, b + s, a + s + 1, b + s, b + s + 1, a + s + 1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [world])
  return <mesh geometry={geometry} material={ICE} receiveShadow />
}

function IcePatch({ world, x, z, radius }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(radius * 2, radius * 2, 18, 18).rotateX(-Math.PI / 2)
    const p = g.attributes.position
    const keep = []
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i)
      const lz = p.getZ(i)
      const r = Math.hypot(lx, lz) / radius
      const wobble = 1 + 0.18 * Math.sin(Math.atan2(lz, lx) * 3 + 1)
      const s = r > wobble ? wobble / r : 1
      const wx = x + lx * s
      const wz = z + lz * s
      p.setXYZ(i, wx, world.height(wx, wz) + 0.03, wz)
      keep.push(s)
    }
    g.computeVertexNormals()
    return g
  }, [world, x, z, radius])
  return <mesh geometry={geometry} material={ICE} receiveShadow />
}

/** Broken rope fence along the ravine edge of the ledge section. */
function LedgeFence({ world }) {
  const posts = useMemo(() => {
    const out = []
    for (let s = LEVEL.ledge.s0 + 2; s < LEVEL.ledge.s1 - 2; s += 4.5) {
      const p = trailPoint(s)
      const lat = TRAIL_HALF_WIDTH + 0.55
      const x = p.x + -p.tz * lat
      const z = p.z + p.tx * lat
      out.push({ x, z, y: world.height(x, z), lean: Math.sin(s) * 0.12 })
    }
    return out
  }, [world])
  return (
    <group>
      {posts.map((p, i) => (
        <mesh key={i} material={WOOD} position={[p.x, p.y + 0.5, p.z]} rotation={[p.lean, 0, -p.lean]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 1.1, 5]} />
        </mesh>
      ))}
      {posts.slice(0, -1).map((p, i) => {
        if (i % 4 === 2) return null // missing sections of rope
        const q = posts[i + 1]
        const dx = q.x - p.x
        const dz = q.z - p.z
        const dy = q.y - p.y
        const len = Math.hypot(dx, dy, dz)
        return (
          <mesh key={`r${i}`} position={[(p.x + q.x) / 2, (p.y + q.y) / 2 + 0.85, (p.z + q.z) / 2]}
            rotation={[0, Math.atan2(dx, dz), 0]}>
            <boxGeometry args={[0.025, 0.025, len]} />
            <meshStandardMaterial color="#b69a6b" roughness={1} />
          </mesh>
        )
      })}
    </group>
  )
}

function Checkpoint({ world }) {
  const cp = LEVEL.checkpoint
  const y = world.height(cp.x, cp.z)
  const flag = useRef()
  const ring = useRef()
  const cx = cp.x + cp.rx * 3.2
  const cz = cp.z + cp.rz * 3.2
  const cy = world.height(cx, cz)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (flag.current) {
      const p = flag.current.geometry.attributes.position
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) + 0.6
        p.setZ(i, Math.sin(t * 5 + u * 4) * 0.12 * u)
      }
      p.needsUpdate = true
    }
    if (ring.current) ring.current.material.opacity = 0.18 + Math.sin(t * 2) * 0.06
  })
  const cairn = useMemo(() => [0.62, 0.5, 0.42, 0.33, 0.24].map((r, i) => ({ r, y: 0.25 + i * 0.36 + (i ? 0.05 : 0) })), [])
  return (
    <group>
      {/* stone cairn */}
      <group position={[cx, cy, cz]}>
        {cairn.map((c, i) => (
          <mesh key={i} position={[Math.sin(i * 2.1) * 0.06, c.y, Math.cos(i * 1.7) * 0.06]} scale={[c.r, c.r * 0.6, c.r * 0.9]} castShadow receiveShadow>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={i % 2 ? '#5d6168' : '#4b4e55'} roughness={0.85} flatShading />
          </mesh>
        ))}
        <mesh material={WOOD_DARK} position={[0, 2.6, 0]} castShadow><cylinderGeometry args={[0.04, 0.05, 3.6, 6]} /></mesh>
        <mesh ref={flag} position={[0.62, 3.95, 0]}>
          <planeGeometry args={[1.2, 0.7, 10, 2]} />
          <meshStandardMaterial color="#d9452b" side={DoubleSide} roughness={0.7} />
        </mesh>
      </group>
      <Sign x={cp.x - cp.rx * 3.4} y={y} z={cp.z - cp.rz * 3.4} yaw={Math.atan2(cp.tx, cp.tz) + Math.PI} lines={['RIDGE CAMP', 'Checkpoint · 2,140 m']} />
      <mesh ref={ring} position={[cp.x, y + 0.06, cp.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.2, 3.6, 48]} />
        <meshBasicMaterial color={new Color('#ffd28a')} transparent opacity={0.2} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Landmarks({ world }) {
  const st = LEVEL.start
  const signX = st.x + st.rx * 3.3 + st.tx * 3
  const signZ = st.z + st.rz * 3.3 + st.tz * 3
  return (
    <group>
      <Sign x={signX} y={world.height(signX, signZ)} z={signZ} yaw={Math.atan2(st.tx, st.tz) + Math.PI - 0.5} lines={['FROZEN TRAIL', 'Ridge Camp 0.4 km  ▲']} />
      <Markers world={world} />
      <Snowbanks world={world} />
      <StreamIce world={world} />
      <IcePatch world={world} x={LEVEL.ledgeIce.x} z={LEVEL.ledgeIce.z} radius={LEVEL.ledgeIce.radius} />
      <LedgeFence world={world} />
      <Checkpoint world={world} />
    </group>
  )
}
