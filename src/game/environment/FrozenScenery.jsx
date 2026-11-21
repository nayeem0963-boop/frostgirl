import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { DynamicDrawUsage, Object3D } from 'three'
import { configureDistanceFade } from '../systems/distanceFade'
import { TRACK_SURFACE_Y } from '../systems/runGeometry'
import { SEGMENT_COUNT, SEGMENT_LENGTH, segmentPosition } from '../systems/trackMotion'
import { snowHeight } from './frozenTerrain'
import { createForestGeometries } from './forestGeometry'
import { forestPlacement, TREES_PER_SEGMENT } from './forestLayout'

const COUNT = SEGMENT_COUNT * TREES_PER_SEGMENT
const TREE_PLACEMENTS = Array.from({ length: COUNT }, (_, index) => forestPlacement(index))

export function FrozenScenery({ run }) {
  const pineA = useRef()
  const pineB = useRef()
  const pineC = useRef()
  const pineD = useRef()
  const bare = useRef()
  const distant = useRef()
  const banks = useRef()
  const rocks = useRef()
  const rockSnow = useRef()
  const ice = useRef()
  const hills = useRef()
  const ponds = useRef()
  const transform = useMemo(() => new Object3D(), [])
  const treeGeometries = useMemo(() => createForestGeometries(), [])
  const fade = useMemo(() => (shader) => configureDistanceFade(shader, run.settings), [run])
  const material = { transparent: true, opacity: 0.96, alphaTest: 0.01, depthWrite: true, fog: false, onBeforeCompile: fade }

  useEffect(() => () => {
    treeGeometries.forEach((geometry) => geometry.dispose())
  }, [treeGeometries])

  useLayoutEffect(() => {
    for (const ref of [pineA, pineB, pineC, pineD, bare, distant, banks, rocks, rockSnow, ice, hills, ponds]) {
      ref.current.instanceMatrix.setUsage(DynamicDrawUsage)
    }
  }, [])

  function place(mesh, index, x, y, z, sx, sy, sz, rotation = 0, lean = 0) {
    transform.position.set(x, y, z)
    transform.rotation.set(0, rotation, lean)
    transform.scale.set(sx, sy, sz)
    transform.updateMatrix()
    mesh.current.setMatrixAt(index, transform.matrix)
  }

  useFrame(() => {
    const trees = [pineA, pineB, pineC, pineD, bare, distant]
    const treeCounts = [0, 0, 0, 0, 0, 0]
    let bankCount = 0
    let rockCount = 0
    let iceCount = 0
    let hillCount = 0
    let pondCount = 0
    for (let index = 0; index < COUNT; index += 1) {
      const segment = Math.floor(index / TREES_PER_SEGMENT)
      const side = index % 2 === 0 ? -1 : 1
      const group = Math.floor((index % TREES_PER_SEGMENT) / 2)
      const center = segmentPosition(segment, run.state.distance) + SEGMENT_LENGTH / 2
      const { x: treeX, localZ: treeLocalZ, height, width, variant, lean, visible } = TREE_PLACEMENTS[index]
      if (visible) {
        const treeZ = center + treeLocalZ
        const base = TRACK_SURFACE_Y + snowHeight(treeX, treeLocalZ)
        place(trees[variant], treeCounts[variant]++, treeX, base, treeZ, width, height, width, segment * 0.4 + index * 0.2, lean)
        place(banks, bankCount++, treeX, base - 0.06, treeZ, 0.85 * width, 0.1, 0.75 * width)
      }

      if (group < 2) {
        const rockX = side * (4.5 + group * 0.75 + segment % 2 * 0.35)
        const rockLocalZ = 3 + group * 2
        const rockZ = center + rockLocalZ
        const rockBase = TRACK_SURFACE_Y + snowHeight(rockX, rockLocalZ)
        if (group === 0) {
          const rockScale = 0.65 + (segment % 3) * 0.12
          place(rocks, rockCount, rockX, rockBase + 0.08, rockZ, rockScale, rockScale * 0.65, rockScale * 0.85, index * 0.7)
          place(rockSnow, rockCount, rockX, rockBase + 0.31 * rockScale, rockZ, rockScale * 0.42, rockScale * 0.09, rockScale * 0.33, index * 0.7)
          rockCount += 1
        } else {
          const iceScale = 0.55 + (segment % 3) * 0.1
          place(ice, iceCount++, rockX, rockBase + 0.43 * iceScale, rockZ, iceScale, iceScale, iceScale, index * 0.7)
        }
      }

      if (group === 0 && segment % 3 === 0) {
        const hillX = side * 15
        const hillBase = TRACK_SURFACE_Y + snowHeight(hillX, 0)
        place(hills, hillCount++, hillX, hillBase - 0.3, center, 3.5, 1.8, 4, segment)
      }
      if (group === 0 && segment % 3 === 1) {
        const pondX = side * 13
        const pondZ = -2
        place(ponds, pondCount++, pondX, TRACK_SURFACE_Y + snowHeight(pondX, pondZ) + 0.04, center + pondZ, 1.6, 0.08, 2.1, segment)
      }
    }
    trees.forEach((ref, index) => { ref.current.count = treeCounts[index] })
    banks.current.count = bankCount
    rocks.current.count = rockCount
    rockSnow.current.count = rockCount
    ice.current.count = iceCount
    hills.current.count = hillCount
    ponds.current.count = pondCount
    for (const mesh of [pineA, pineB, pineC, pineD, bare, distant, banks, rocks, rockSnow, ice, hills, ponds]) {
      mesh.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={pineA} args={[treeGeometries[0], null, COUNT]} frustumCulled={false}>
        <meshStandardMaterial {...material} vertexColors roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={pineB} args={[treeGeometries[1], null, COUNT]} frustumCulled={false}>
        <meshStandardMaterial {...material} vertexColors roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={pineC} args={[treeGeometries[2], null, COUNT]} frustumCulled={false}>
        <meshStandardMaterial {...material} vertexColors roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={pineD} args={[treeGeometries[3], null, COUNT]} frustumCulled={false}>
        <meshStandardMaterial {...material} vertexColors roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={bare} args={[treeGeometries[4], null, COUNT]} frustumCulled={false}>
        <meshStandardMaterial {...material} vertexColors roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={distant} args={[treeGeometries[5], null, COUNT]} frustumCulled={false}>
        <meshStandardMaterial {...material} vertexColors roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={banks} args={[null, null, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 6]} />
        <meshStandardMaterial {...material} color="#e0f2f8" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[null, null, COUNT]} frustumCulled={false}>
        <icosahedronGeometry args={[0.65, 0]} />
        <meshStandardMaterial {...material} color="#8ba9ba" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={rockSnow} args={[null, null, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 5]} />
        <meshStandardMaterial {...material} color="#e1f1f3" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={ice} args={[null, null, COUNT]} frustumCulled={false}>
        <coneGeometry args={[0.32, 0.9, 5]} />
        <meshStandardMaterial {...material} color="#a8d7e4" roughness={0.35} metalness={0.08} />
      </instancedMesh>
      <instancedMesh ref={hills} args={[null, null, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 6]} />
        <meshStandardMaterial {...material} color="#c5dfe9" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={ponds} args={[null, null, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 6]} />
        <meshStandardMaterial {...material} color="#86bacb" roughness={0.55} metalness={0.03} />
      </instancedMesh>
    </>
  )
}

