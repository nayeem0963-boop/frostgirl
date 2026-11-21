import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, ConeGeometry, DynamicDrawUsage, ExtrudeGeometry, Float32BufferAttribute, Object3D, Shape } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { configureDistanceFade } from '../systems/distanceFade'
import { TRACK_SURFACE_Y } from '../systems/runGeometry'
import { SEGMENT_COUNT, SEGMENT_LENGTH, segmentPosition } from '../systems/trackMotion'
import { snowHeight } from './frozenTerrain'

const SIDES = SEGMENT_COUNT * 2
const FENCE_ROWS = 4
const HOUSE_STYLES = [
  [1, 1, 1], [0.86, 1.18, 1.1], [1.12, 0.89, 0.86],
]

function roofGeometry(snow) {
  const parts = [-1, 1].map((side) =>
    new BoxGeometry(2.08, snow ? 0.12 : 0.22, 3.75)
      .rotateZ(-side * 0.62)
      .translate(side * 0.79, 2.48 + (snow ? 0.22 : 0), 0),
  )
  const result = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return result
}

function gableGeometry() {
  const shape = new Shape()
  shape.moveTo(-1.5, 2.05)
  shape.lineTo(0, 3.03)
  shape.lineTo(1.5, 2.05)
  shape.closePath()
  return new ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false }).translate(0, 0, -1.6)
}

function windowBarsGeometry() {
  const parts = [new BoxGeometry(0.055, 0.64, 0.07), new BoxGeometry(0.52, 0.055, 0.07)]
  const result = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return result
}

function cottageTrimGeometry() {
  const parts = [
    new BoxGeometry(0.13, 2.05, 0.1).translate(-1.43, 1.03, 1.64),
    new BoxGeometry(0.13, 2.05, 0.1).translate(1.43, 1.03, 1.64),
    new BoxGeometry(2.9, 0.13, 0.1).translate(0, 1.95, 1.64),
    new BoxGeometry(0.12, 1.38, 0.12).translate(-0.49, 0.69, 2.13),
    new BoxGeometry(0.12, 1.38, 0.12).translate(0.49, 0.69, 2.13),
    new BoxGeometry(1.15, 0.12, 0.75).translate(0, 1.4, 1.94),
    new BoxGeometry(0.9, 0.12, 0.65).translate(0, 0.06, 1.91),
  ]
  const result = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return result
}

function towerGeometry() {
  const parts = [
    [new BoxGeometry(1.25, 3.1, 1.25).translate(0, 1.55, 0), '#b5cbd0'],
    [new ConeGeometry(1.05, 1.2, 4).rotateY(Math.PI / 4).translate(0, 3.65, 0), '#6e8b99'],
    [new ConeGeometry(0.65, 0.6, 4).rotateY(Math.PI / 4).translate(0, 3.96, 0), '#e4f2f3'],
    [new BoxGeometry(0.34, 0.58, 0.06).translate(0, 2.25, 0.65), '#ffd28a'],
  ]
  for (const [geometry, color] of parts) {
    const shade = new Color(color)
    const colors = []
    for (let index = 0; index < geometry.attributes.position.count; index += 1) {
      colors.push(shade.r, shade.g, shade.b)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  }
  const result = mergeGeometries(parts.map(([geometry]) => geometry))
  parts.forEach(([geometry]) => geometry.dispose())
  return result
}

export function VillageStructures({ run }) {
  const walls = useRef()
  const foundations = useRef()
  const roof = useRef()
  const roofSnow = useRef()
  const gables = useRef()
  const windows = useRef()
  const windowFrames = useRef()
  const windowBars = useRef()
  const doors = useRef()
  const chimneys = useRef()
  const chimneySnow = useRef()
  const trim = useRef()
  const porchSnow = useRef()
  const towers = useRef()
  const posts = useRef()
  const rails = useRef()
  const railSnow = useRef()
  const lampPosts = useRef()
  const lamps = useRef()
  const lampCaps = useRef()
  const leftLight = useRef()
  const rightLight = useRef()
  const transform = useMemo(() => new Object3D(), [])
  const roofShape = useMemo(() => roofGeometry(false), [])
  const snowShape = useMemo(() => roofGeometry(true), [])
  const gableShape = useMemo(() => gableGeometry(), [])
  const barsShape = useMemo(() => windowBarsGeometry(), [])
  const trimShape = useMemo(() => cottageTrimGeometry(), [])
  const towerShape = useMemo(() => towerGeometry(), [])
  const fade = useMemo(() => (shader) => configureDistanceFade(shader, run.settings), [run])
  const material = { transparent: true, alphaTest: 0.01, depthWrite: true, fog: false, onBeforeCompile: fade }

  useEffect(() => () => {
    roofShape.dispose()
    snowShape.dispose()
    gableShape.dispose()
    barsShape.dispose()
    trimShape.dispose()
    towerShape.dispose()
  }, [roofShape, snowShape, gableShape, barsShape, trimShape, towerShape])

  useLayoutEffect(() => {
    for (const ref of [walls, foundations, roof, roofSnow, gables, windows, windowFrames, windowBars, doors, chimneys, chimneySnow, trim, porchSnow, towers, posts, rails, railSnow, lampPosts, lamps, lampCaps]) {
      ref.current.instanceMatrix.setUsage(DynamicDrawUsage)
    }
    const color = new Color()
    const tones = ['#f7e9d8', '#cbdfea', '#e2c6bd']
    for (let index = 0; index < SIDES; index += 1) {
      color.set(tones[Math.floor(index / 6) % tones.length])
      walls.current.setColorAt(index, color)
      gables.current.setColorAt(index, color)
    }
    walls.current.instanceColor.needsUpdate = true
    gables.current.instanceColor.needsUpdate = true
  }, [])

  function place(ref, index, x, y, z, sx = 1, sy = 1, sz = 1) {
    transform.position.set(x, y, z)
    transform.rotation.set(0, 0, 0)
    transform.scale.set(sx, sy, sz)
    transform.updateMatrix()
    ref.current.setMatrixAt(index, transform.matrix)
  }

  useFrame(() => {
    let nearestLampZ = 0
    let nearestDistance = Infinity
    for (let index = 0; index < SIDES; index += 1) {
      const segment = Math.floor(index / 2)
      const side = index % 2 === 0 ? -1 : 1
      const center = segmentPosition(segment, run.state.distance) + SEGMENT_LENGTH / 2
      const houseX = side * (8.2 + segment % 2)
      const houseZ = center + 8
      const base = TRACK_SURFACE_Y + snowHeight(houseX, 8)
      const houseScale = segment % 2 === 0 && (segment / 2) % 2 === index % 2 ? 0.85 + (segment % 3) * 0.07 : 0
      const style = HOUSE_STYLES[Math.floor(segment / 2) % HOUSE_STYLES.length]
      const sx = houseScale * style[0]
      const sy = houseScale * style[1]
      const sz = houseScale * style[2]
      place(walls, index, houseX, base + 1.05 * sy, houseZ, sx, sy, sz)
      place(foundations, index, houseX, base + 0.02 * sy, houseZ, sx, sy, sz)
      place(roof, index, houseX, base, houseZ, sx, sy, sz)
      place(roofSnow, index, houseX, base, houseZ, sx, sy, sz)
      place(gables, index, houseX, base, houseZ, sx, sy, sz)
      place(doors, index, houseX, base + 0.58 * sy, houseZ + 1.61 * sz, sx, sy, sz)
      place(chimneys, index, houseX + 0.85 * sx, base + 2.9 * sy, houseZ - 0.7 * sz, sx, sy, sz)
      place(chimneySnow, index, houseX + 0.85 * sx, base + 3.4 * sy, houseZ - 0.7 * sz, sx, sy, sz)
      place(trim, index, houseX, base, houseZ, sx, sy, sz)
      place(porchSnow, index, houseX, base + 1.49 * sy, houseZ + 1.94 * sz, sx, sy, sz)
      const towerX = side * 12
      const towerScale = segment % 4 === 0 && (segment / 4) % 2 !== index % 2 ? 1 : 0
      place(towers, index, towerX, TRACK_SURFACE_Y + snowHeight(towerX, 7), center + 7, towerScale, towerScale, towerScale)
      for (let window = 0; window < 2; window += 1) {
        const x = houseX + (window ? 0.9 : -0.9) * sx
        place(windows, index * 2 + window, x, base + 1.28 * sy, houseZ + 1.62 * sz, sx, sy, sz)
        place(windowFrames, index * 2 + window, x, base + 1.28 * sy, houseZ + 1.61 * sz, sx, sy, sz)
        place(windowBars, index * 2 + window, x, base + 1.28 * sy, houseZ + 1.67 * sz, sx, sy, sz)
      }

      const fenceX = side * 3.35
      for (let row = 0; row < FENCE_ROWS; row += 1) {
        const postLocal = -12 + row * 6
        const railLocal = postLocal + 3
        const postBase = TRACK_SURFACE_Y + snowHeight(fenceX, postLocal)
        const railBase = TRACK_SURFACE_Y + snowHeight(fenceX, railLocal)
        const fenceIndex = index * FENCE_ROWS + row
        place(posts, fenceIndex, fenceX, postBase + 0.48, center + postLocal)
        place(rails, fenceIndex, fenceX, railBase + 0.55, center + railLocal)
        place(railSnow, fenceIndex, fenceX, railBase + 0.63, center + railLocal)
      }
      const lampX = side * 3.75
      const lampZ = center - 8
      const lampBase = TRACK_SURFACE_Y + snowHeight(lampX, -8)
      const lampScale = segment % 2 === 0 ? 1 : 0
      if (lampScale && Math.abs(lampZ - run.settings.playerZ) < nearestDistance) {
        nearestDistance = Math.abs(lampZ - run.settings.playerZ)
        nearestLampZ = lampZ
      }
      place(lampPosts, index, lampX, lampBase + 0.9 * lampScale, lampZ, lampScale, lampScale, lampScale)
      place(lamps, index, lampX, lampBase + 1.95 * lampScale, lampZ, lampScale, lampScale, lampScale)
      place(lampCaps, index, lampX, lampBase + 2.22 * lampScale, lampZ, lampScale, lampScale, lampScale)
    }
    for (const ref of [walls, foundations, roof, roofSnow, gables, windows, windowFrames, windowBars, doors, chimneys, chimneySnow, trim, porchSnow, towers, posts, rails, railSnow, lampPosts, lamps, lampCaps]) {
      ref.current.instanceMatrix.needsUpdate = true
    }
    const lightY = TRACK_SURFACE_Y + snowHeight(3.75, -8) + 1.95
    leftLight.current.position.set(-3.75, lightY, nearestLampZ)
    rightLight.current.position.set(3.75, lightY, nearestLampZ)
  })

  return (
    <>
      <pointLight ref={leftLight} color="#ffc37b" intensity={12} distance={8} decay={2} />
      <pointLight ref={rightLight} color="#ffc37b" intensity={12} distance={8} decay={2} />
      <instancedMesh ref={walls} args={[null, null, SIDES]} frustumCulled={false}>
        <boxGeometry args={[3, 2.1, 3.2]} />
        <meshStandardMaterial {...material} color="#826d69" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={foundations} args={[null, null, SIDES]} frustumCulled={false}>
        <boxGeometry args={[3.18, 0.45, 3.38]} />
        <meshStandardMaterial {...material} color="#9bb5be" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={roof} args={[roofShape, null, SIDES]} frustumCulled={false}>
        <meshStandardMaterial {...material} color="#435e6c" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={roofSnow} args={[snowShape, null, SIDES]} frustumCulled={false}>
        <meshStandardMaterial {...material} color="#e1f3f5" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={gables} args={[gableShape, null, SIDES]} frustumCulled={false}>
        <meshStandardMaterial {...material} color="#826d69" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={windowFrames} args={[null, null, SIDES * 2]} frustumCulled={false}>
        <boxGeometry args={[0.7, 0.82, 0.07]} />
        <meshStandardMaterial {...material} color="#594c48" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={windows} args={[null, null, SIDES * 2]} frustumCulled={false}>
        <boxGeometry args={[0.52, 0.64, 0.06]} />
        <meshStandardMaterial {...material} color="#ffca78" emissive="#d07620" emissiveIntensity={1.4} />
      </instancedMesh>
      <instancedMesh ref={windowBars} args={[barsShape, null, SIDES * 2]} frustumCulled={false}>
        <meshStandardMaterial {...material} color="#72594c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={doors} args={[null, null, SIDES]} frustumCulled={false}>
        <boxGeometry args={[0.55, 1.16, 0.08]} />
        <meshStandardMaterial {...material} color="#584943" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={chimneys} args={[null, null, SIDES]} frustumCulled={false}>
        <boxGeometry args={[0.4, 0.9, 0.4]} />
        <meshStandardMaterial {...material} color="#776b69" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={chimneySnow} args={[null, null, SIDES]} frustumCulled={false}>
        <boxGeometry args={[0.48, 0.12, 0.48]} />
        <meshStandardMaterial {...material} color="#e1f3f5" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={trim} args={[trimShape, null, SIDES]} frustumCulled={false}>
        <meshStandardMaterial {...material} color="#624e46" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={porchSnow} args={[null, null, SIDES]} frustumCulled={false}>
        <boxGeometry args={[1.2, 0.07, 0.8]} />
        <meshStandardMaterial {...material} color="#e1f3f5" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={towers} args={[towerShape, null, SIDES]} frustumCulled={false}>
        <meshStandardMaterial {...material} vertexColors roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={posts} args={[null, null, SIDES * FENCE_ROWS]} frustumCulled={false}>
        <boxGeometry args={[0.14, 0.96, 0.14]} />
        <meshStandardMaterial {...material} color="#765f59" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={rails} args={[null, null, SIDES * FENCE_ROWS]} frustumCulled={false}>
        <boxGeometry args={[0.12, 0.14, 6]} />
        <meshStandardMaterial {...material} color="#927d70" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={railSnow} args={[null, null, SIDES * FENCE_ROWS]} frustumCulled={false}>
        <boxGeometry args={[0.13, 0.035, 6]} />
        <meshStandardMaterial {...material} color="#cadfe5" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={lampPosts} args={[null, null, SIDES]} frustumCulled={false}>
        <cylinderGeometry args={[0.07, 0.1, 1.8, 6]} />
        <meshStandardMaterial {...material} color="#45515a" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[null, null, SIDES]} frustumCulled={false}>
        <boxGeometry args={[0.32, 0.42, 0.32]} />
        <meshStandardMaterial {...material} color="#ffd184" emissive="#e58728" emissiveIntensity={1.8} />
      </instancedMesh>
      <instancedMesh ref={lampCaps} args={[null, null, SIDES]} frustumCulled={false}>
        <coneGeometry args={[0.3, 0.22, 4]} />
        <meshStandardMaterial {...material} color="#657985" roughness={0.9} />
      </instancedMesh>
    </>
  )
}
