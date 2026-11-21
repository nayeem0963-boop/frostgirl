import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry, Color, ConeGeometry, DoubleSide, DynamicDrawUsage,
  Float32BufferAttribute, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Raycaster, SphereGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Snowfall } from '../systems/Snowfall'
import { createTrackFrame, sampleSpiralTrack, trackPosition } from '../systems/spiralTrack'
import { CelestialSky } from './CelestialSky'
import { createMountainForestGeometries } from './forestGeometry'
import {
  createMountainSection, createShelfSection, innerShelfReach, MOUNTAIN_SECTION_COUNT,
  MOUNTAIN_SECTION_HEIGHT, mountainRadius, projectToShelf, SHELF_SECTION_COUNT, SHELF_SECTION_LENGTH,
  shelfHeight, updateMountainSection, updateShelfSection,
} from './crystalMountainGeometry'
import { mountainPlacements } from './crystalMountainLayout'

const COLORS = ['#89e1ed', '#8dc9ed', '#b6a9e3']
const FALLS = [260, 730, 1240, 1740]
const SUMMIT_DISTANCE = 1900
const WORLD_UP = new Vector3(0, 1, 0)

function clusterGeometry() {
  const parts = [
    new ConeGeometry(0.55, 2.4, 5).translate(0, 1.2, 0),
    new ConeGeometry(0.35, 1.45, 5).rotateZ(-0.15).translate(0.55, 0.72, 0.1),
    new ConeGeometry(0.32, 1.25, 5).rotateZ(0.15).translate(-0.48, 0.62, -0.15),
  ]
  const geometry = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return geometry
}

function cloudGeometry() {
  const parts = [
    new SphereGeometry(1, 8, 5).scale(2.6, 0.45, 1.1),
    new SphereGeometry(1, 8, 5).scale(1.5, 0.65, 1).translate(-1.3, 0.18, 0),
    new SphereGeometry(1, 8, 5).scale(1.6, 0.6, 0.9).translate(1.2, 0.1, 0),
  ]
  const geometry = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return geometry
}

function ridgeGeometry() {
  const positions = []
  const colors = []
  const indices = []
  const columns = 21
  const rows = 9
  for (let row = 0; row < rows; row += 1) {
    const z = (row / (rows - 1) - 0.5) * 18
    for (let column = 0; column < columns; column += 1) {
      const x = (column / (columns - 1) - 0.5) * 28
      const peaks = 8 * Math.exp(-(((x + 4.5 + z * 0.18) / 7) ** 2))
        + 6 * Math.exp(-(((x - 6 - z * 0.3) / 4.5) ** 2))
      const slope = Math.max(0, 1 - (z / 9) ** 2)
      const roughness = 1 + 0.1 * Math.sin(x * 0.9 + z * 0.6) + 0.07 * Math.sin(x * 1.5 - z * 1.1)
      const ledges = 0.55 * Math.sin(x * 0.63 + z * 0.24)
        * Math.sin(x * 0.23 - z * 0.76)
      const height = -2.5 + peaks * slope * (roughness + ledges * 0.12)
      positions.push(x, height, z)
      const snow = Math.max(0, Math.min(1, (height - 0.5 + 2 * Math.sin(x * 0.5 + z * 0.7)) / 4))
      const shade = new Color('#63686a').lerp(new Color('#d8e2df'), snow)
      colors.push(shade.r, shade.g, shade.b)
      if (row < rows - 1 && column < columns - 1) {
        const a = row * columns + column
        indices.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function distantRangesGeometry() {
  const positions = []
  const colors = []
  const indices = []
  const sides = 144
  const radii = [142, 148, 154, 160, 166, 172, 178, 184, 190, 197, 204, 211, 218, 228, 238]
  const baseHeights = [-32, -25, -19, -11, -3, 5, 14, 21, 11, 0, 8, 21, 30, 2, -25]
  const ridgeWeights = [0.1, 0.15, 0.22, 0.32, 0.44, 0.6, 0.78, 1, 0.72, 0.4, 0.6, 0.82, 1, 0.5, 0.1]
  const peaks = [[0.15, 18, 30], [1.13, 30, 55], [2.26, 22, 24],
    [3.05, 35, 38], [4.1, 24, 45], [5.02, 32, 28], [5.78, 20, 50]]
  for (let row = 0; row < radii.length; row += 1) {
    for (let side = 0; side <= sides; side += 1) {
      const angle = side * Math.PI * 2 / sides
      const ridge = 11 * Math.sin(angle * 3 + row * 0.11 + 0.8)
        + 7 * Math.sin(angle * 7 - row * 0.17)
        + 4 * Math.sin(angle * 13 + row * 0.09 + 1.7)
      const gullies = 5 * Math.sin(angle * 23 + Math.sin(row * 0.45))
        + 2.2 * Math.sin(angle * 41 - row * 0.5)
      const summits = peaks.reduce((sum, [center, height, sharpness], index) =>
        sum + height * (Math.exp(sharpness * (Math.cos(angle - center) - 1))
          + 0.28 * Math.exp(sharpness * 1.5 * (Math.cos(angle - center + (index % 2 ? 0.16 : -0.2)) - 1))), 0)
      const farLayer = Math.max(0, 1 - Math.abs(row - 12) / 3)
      const height = baseHeights[row] + ridge * ridgeWeights[row]
        + summits * farLayer * (1 + 0.12 * Math.sin(angle * 29 + row * 0.18))
        + (gullies + 1.1 * Math.sin(angle * 31 + 1.2) * Math.sin(row * 0.62))
          * Math.sin(row * Math.PI / (radii.length - 1))
      positions.push(radii[row] * Math.cos(angle), height, radii[row] * Math.sin(angle))
      if (row < radii.length - 1 && side < sides) {
        const index = row * (sides + 1) + side
        indices.push(index, index + sides + 1, index + 1,
          index + 1, index + sides + 1, index + sides + 2)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const normals = geometry.attributes.normal
  const seamNormal = new Vector3()
  for (let row = 0; row < radii.length; row += 1) {
    const first = row * (sides + 1)
    const last = first + sides
    seamNormal.fromBufferAttribute(normals, first)
      .add(new Vector3().fromBufferAttribute(normals, last)).normalize()
    normals.setXYZ(first, seamNormal.x, seamNormal.y, seamNormal.z)
    normals.setXYZ(last, seamNormal.x, seamNormal.y, seamNormal.z)
  }
  for (let row = 0; row < radii.length; row += 1) {
    for (let side = 0; side <= sides; side += 1) {
      const angle = side * Math.PI * 2 / sides
      const index = row * (sides + 1) + side
      const height = positions[index * 3 + 1]
      const slope = Math.abs(normals.getY(index))
      const snowline = Math.max(0, Math.min(1, (height + 4 + 4 * Math.sin(angle * 9 + row * 0.3)) / 25))
      const patch = 0.5 + 0.5 * Math.sin(angle * 11 + row * 0.55 + Math.sin(angle * 5))
        * Math.sin(angle * 23 - row * 0.3)
      const snow = snowline * (0.2 + 0.8 * slope) * (0.25 + 0.75 * patch)
      const haze = Math.max(0, (row - 8) / 6) * 0.08
      const rock = 0.065 * Math.sin(angle * 19 + row * 0.45)
        + 0.035 * Math.sin(angle * 37 - row * 0.5) * Math.sin(angle * 11 + row * 0.4)
      colors.push(0.15 + snow * 0.29 + haze + rock, 0.18 + snow * 0.3 + haze + rock, 0.19 + snow * 0.31 + haze + rock)
    }
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function waterfallGeometry() {
  const positions = []
  const indices = []
  const frame = createTrackFrame()
  for (const distance of FALLS) {
    sampleSpiralTrack(distance, frame)
    const angle = Math.atan2(frame.position.z, frame.position.x)
    const top = frame.position.y + 7
    const baseIndex = positions.length / 3
    for (let row = 0; row <= 12; row += 1) {
      const height = top - row * 1.5
      for (let side = 0; side < 2; side += 1) {
        const a = angle + (side ? 0.026 : -0.026)
        const radius = mountainRadius(a, height) + 0.12
        positions.push(radius * Math.cos(a), height, radius * Math.sin(a))
      }
      if (row < 12) {
        const index = baseIndex + row * 2
        indices.push(index, index + 2, index + 1, index + 1, index + 2, index + 3)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function Summit() {
  const frame = useMemo(() => sampleSpiralTrack(SUMMIT_DISTANCE, createTrackFrame()), [])
  const angle = Math.atan2(frame.position.x, frame.position.z)
  const radius = 73.7
  const height = frame.position.y + 8
  return (
    <group position={[Math.sin(angle) * radius, height, Math.cos(angle) * radius]} rotation={[0, angle, 0]}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[4.2, 2.8, 1.1]} />
        <meshStandardMaterial color="#c6e8ed" roughness={0.85} />
      </mesh>
      {[-1.45, 0, 1.45].map((x, index) => (
        <group key={x} position={[x, 0, 0.15]}>
          <mesh position={[0, 2.3 + (index === 1 ? 0.5 : 0), 0]}>
            <cylinderGeometry args={[0.38, 0.48, 3.8 + (index === 1 ? 1 : 0), 5]} />
            <meshStandardMaterial color="#b4dce6" roughness={0.8} />
          </mesh>
          <mesh position={[0, 4.65 + (index === 1 ? 1 : 0), 0]}>
            <coneGeometry args={[0.7, 1.5, 5]} />
            <meshStandardMaterial color="#94d8ed" emissive="#276778" emissiveIntensity={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function MountainSnow({ run, paused }) {
  const group = useRef()
  const resources = useMemo(() => ({ frame: createTrackFrame(), backward: new Vector3(), basis: new Matrix4() }), [])
  useFrame(() => {
    const { frame, backward, basis } = resources
    sampleSpiralTrack(run.state.distance, frame)
    group.current.position.set(frame.position.x, 0, frame.position.z)
    backward.copy(frame.tangent).negate()
    group.current.quaternion.setFromRotationMatrix(basis.makeBasis(frame.right, frame.up, backward))
  })
  return <group ref={group}><Snowfall run={run} paused={paused} /></group>
}

export function CrystalMountain({ run, paused }) {
  const mountainRoot = useRef()
  const shelfRoot = useRef()
  const sceneryRoot = useRef()
  const rangesRoot = useRef()
  const mountainMeshes = useRef([])
  const shelfMeshes = useRef([])
  const trees = useRef([])
  const crystals = useRef()
  const lakes = useRef()
  const clouds = useRef()
  const ridges = useRef()
  const skyClouds = useRef()
  const skyRoot = useRef()
  const cloudBank = useRef()
  const groundMesh = useRef()
  const assignedMountains = useRef(Array(MOUNTAIN_SECTION_COUNT).fill(null))
  const assignedShelves = useRef(Array(SHELF_SECTION_COUNT).fill(null))
  const lastScenery = useRef(null)
  const resources = useMemo(() => ({
    mountains: Array.from({ length: MOUNTAIN_SECTION_COUNT }, createMountainSection),
    shelves: Array.from({ length: SHELF_SECTION_COUNT }, createShelfSection),
    mountainMaterial: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    shelfMaterial: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    forestMaterial: new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    crystalMaterial: new MeshStandardMaterial({ color: '#b9f5ff', emissive: '#286578', emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.08 }),
    cloudMaterial: new MeshStandardMaterial({ color: '#d5e6e9', roughness: 1 }),
    skyCloudMaterial: new MeshBasicMaterial({ color: '#9db4be', fog: false }),
    ridgeMaterial: new MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    rangeMaterial: new MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false, side: DoubleSide }),
    waterfallMaterial: new MeshStandardMaterial({ color: '#9bdce9', emissive: '#245667', emissiveIntensity: 0.2, roughness: 0.45, side: DoubleSide }),
    forest: createMountainForestGeometries(),
    crystal: clusterGeometry(),
    cloud: cloudGeometry(),
    ridge: ridgeGeometry(),
    ranges: distantRangesGeometry(),
    waterfall: waterfallGeometry(),
    frame: createTrackFrame(),
    anchor: new Vector3(),
    point: new Vector3(),
    surfaceNormal: new Vector3(),
    transform: new Object3D(),
    color: new Color(),
    groundRay: new Raycaster(),
    groundHits: [],
  }), [])

  useEffect(() => () => {
    resources.mountains.forEach((geometry) => geometry.dispose())
    resources.shelves.forEach((geometry) => geometry.dispose())
    resources.forest.forEach((geometry) => geometry.dispose())
    resources.mountainMaterial.dispose()
    resources.shelfMaterial.dispose()
    resources.forestMaterial.dispose()
    resources.crystalMaterial.dispose()
    resources.cloudMaterial.dispose()
    resources.skyCloudMaterial.dispose()
    resources.ridgeMaterial.dispose()
    resources.rangeMaterial.dispose()
    resources.waterfallMaterial.dispose()
    resources.crystal.dispose()
    resources.cloud.dispose()
    resources.ridge.dispose()
    resources.ranges.dispose()
    resources.waterfall.dispose()
  }, [resources])

  useLayoutEffect(() => {
    groundMesh.current = new Mesh()
    assignedMountains.current.fill(null)
    assignedShelves.current.fill(null)
    lastScenery.current = null
    for (const mesh of [...trees.current, crystals.current, lakes.current, clouds.current, ridges.current]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    }
    const { transform } = resources
    for (let index = 0; index < 7; index += 1) {
      const angle = index * Math.PI * 2 / 7 + 0.35 + 0.12 * Math.sin(index * 3)
      transform.position.set(Math.cos(angle) * 145, 34 + (index % 3) * 4, Math.sin(angle) * 145)
      transform.rotation.set(0, -angle - Math.PI / 2, 0)
      transform.scale.set(2.7 + (index % 3) * 0.55, 2 + (index % 2) * 0.4, 2.2)
      transform.updateMatrix()
      skyClouds.current.setMatrixAt(index, transform.matrix)
      transform.position.set(Math.cos(angle + 0.2) * 135, (index % 3) * 1.5, Math.sin(angle + 0.2) * 135)
      transform.rotation.set(0, -angle - 0.2 - Math.PI / 2, 0)
      transform.scale.set(3.2 + (index % 3) * 1.2, 1.3 + (index % 2) * 0.5, 2.5)
      transform.updateMatrix()
      cloudBank.current.setMatrixAt(index, transform.matrix)
    }
    skyClouds.current.instanceMatrix.needsUpdate = true
    cloudBank.current.instanceMatrix.needsUpdate = true
  }, [resources])

  useFrame((_, delta) => {
    const { frame, anchor, point, surfaceNormal, transform, color, groundRay, groundHits } = resources
    sampleSpiralTrack(run.state.distance, frame)
    const playerHeight = frame.position.y
    skyRoot.current.position.set(frame.position.x, 0, frame.position.z)
    cloudBank.current.position.y = -5 - Math.min(17, Math.max(0, playerHeight) * 0.35)
    if (!paused) skyRoot.current.rotation.y += Math.min(delta, 0.05) * 0.0015
    rangesRoot.current.position.y = -Math.min(18, Math.max(0, playerHeight) * 0.3)
    mountainRoot.current.position.y = -playerHeight
    shelfRoot.current.position.y = -playerHeight
    const mountainSection = Math.floor(playerHeight / MOUNTAIN_SECTION_HEIGHT)
    for (let offset = -MOUNTAIN_SECTION_COUNT / 2; offset < MOUNTAIN_SECTION_COUNT / 2; offset += 1) {
      const section = mountainSection + offset
      const slot = ((section % MOUNTAIN_SECTION_COUNT) + MOUNTAIN_SECTION_COUNT) % MOUNTAIN_SECTION_COUNT
      if (assignedMountains.current[slot] !== section) {
        updateMountainSection(resources.mountains[slot], section)
        mountainMeshes.current[slot].position.y = section * MOUNTAIN_SECTION_HEIGHT
        assignedMountains.current[slot] = section
      }
    }
    const currentSection = Math.floor(run.state.distance / SHELF_SECTION_LENGTH)
    for (let offset = -SHELF_SECTION_COUNT / 2; offset < SHELF_SECTION_COUNT / 2; offset += 1) {
      const section = currentSection + offset
      const slot = ((section % SHELF_SECTION_COUNT) + SHELF_SECTION_COUNT) % SHELF_SECTION_COUNT
      shelfMeshes.current[slot].visible = offset >= -5 && offset <= 5
      if (shelfMeshes.current[slot].visible && assignedShelves.current[slot] !== section) {
        updateShelfSection(resources.shelves[slot], section, anchor, frame, point)
        shelfMeshes.current[slot].position.copy(anchor)
        assignedShelves.current[slot] = section
      }
    }
    const baseHeight = mountainSection * MOUNTAIN_SECTION_HEIGHT
    sceneryRoot.current.position.y = baseHeight - playerHeight
    if (lastScenery.current !== `${currentSection}:${mountainSection}`) {
      const counts = [0, 0, 0, 0]
      let crystalCount = 0
      let lakeCount = 0
      let cloudCount = 0
      let ridgeCount = 0
      function place(mesh, index, placement, height, sx, sy, sz, rotation = 0, grounded = false, alignShelf = false, lean = 0) {
        sampleSpiralTrack(placement.distance, frame)
        trackPosition(frame, placement.lateral, height, point)
        if (grounded) {
          const section = Math.floor(placement.distance / SHELF_SECTION_LENGTH)
          const slot = ((section % SHELF_SECTION_COUNT) + SHELF_SECTION_COUNT) % SHELF_SECTION_COUNT
          if (assignedShelves.current[slot] !== section) throw new Error(`Missing terrain section ${section}`)
          groundMesh.current.geometry = resources.shelves[slot]
          groundMesh.current.material = resources.shelfMaterial
          groundMesh.current.position.copy(shelfMeshes.current[slot].position)
          groundMesh.current.updateMatrixWorld()
          projectToShelf(groundMesh.current, groundRay, groundHits, frame, placement.lateral, height, point, surfaceNormal)
        }
        point.setY(point.y - baseHeight)
        transform.position.copy(point)
        transform.rotation.set(0, rotation, lean)
        if (alignShelf) {
          transform.quaternion.setFromUnitVectors(WORLD_UP, surfaceNormal)
        }
        transform.scale.set(sx, sy, sz)
        transform.updateMatrix()
        mesh.setMatrixAt(index, transform.matrix)
      }
      function hasVisibleShelf(placement) {
        return Math.abs(Math.floor(placement.distance / SHELF_SECTION_LENGTH) - currentSection) <= 5
      }
      for (let offset = -5; offset <= 5; offset += 1) {
        const section = currentSection + offset
        const placements = mountainPlacements(section)
        for (const tree of placements.trees) {
          if (!hasVisibleShelf(tree)) continue
          place(trees.current[tree.variant], counts[tree.variant]++, tree, -0.1,
            tree.scale * tree.width, tree.scale, tree.scale * tree.width, tree.rotation, true, false, tree.lean)
        }
        for (const crystal of placements.crystals) {
          if (!hasVisibleShelf(crystal)) continue
          place(crystals.current, crystalCount, crystal, -0.1, crystal.scale, crystal.scale, crystal.scale, crystal.rotation, true)
          crystals.current.setColorAt(crystalCount++, color.set(COLORS[crystal.color]))
        }
        if (placements.lake && hasVisibleShelf(placements.lake)) {
          place(lakes.current, lakeCount++, placements.lake, 0.02, 2.4, 0.12, 3.2, 0, true, true)
        }
        if (placements.cloud) {
          place(clouds.current, cloudCount++, placements.cloud, placements.cloud.height, 1.8, 1.2, 1.8, section)
        }
        if (placements.ridge && hasVisibleShelf(placements.ridge)) {
          sampleSpiralTrack(placements.ridge.distance, frame)
          const height = shelfHeight(placements.ridge.lateral, innerShelfReach(frame), placements.ridge.distance) - 1
          place(ridges.current, ridgeCount++, placements.ridge, height, 1, 1, 1, placements.ridge.rotation)
        }
      }
      trees.current.forEach((mesh, index) => { mesh.count = counts[index]; mesh.instanceMatrix.needsUpdate = true })
      crystals.current.count = crystalCount
      crystals.current.instanceMatrix.needsUpdate = true
      if (crystals.current.instanceColor) crystals.current.instanceColor.needsUpdate = true
      lakes.current.count = lakeCount
      lakes.current.instanceMatrix.needsUpdate = true
      clouds.current.count = cloudCount
      clouds.current.instanceMatrix.needsUpdate = true
      ridges.current.count = ridgeCount
      ridges.current.instanceMatrix.needsUpdate = true
      lastScenery.current = `${currentSection}:${mountainSection}`
    }
  })

  return (
    <>
      <CelestialSky run={run} />
      <group ref={rangesRoot}>
        <mesh geometry={resources.ranges} material={resources.rangeMaterial} dispose={null} />
      </group>
      <group ref={skyRoot}>
        <instancedMesh ref={skyClouds} args={[resources.cloud, resources.skyCloudMaterial, 7]} frustumCulled={false} dispose={null} />
        <instancedMesh ref={cloudBank} args={[resources.cloud, resources.skyCloudMaterial, 7]} frustumCulled={false} dispose={null} />
      </group>
      <group ref={mountainRoot}>
        {resources.mountains.map((geometry, index) => (
          <mesh key={index} ref={(mesh) => { mountainMeshes.current[index] = mesh }} geometry={geometry} material={resources.mountainMaterial} dispose={null} />
        ))}
        <mesh geometry={resources.waterfall} material={resources.waterfallMaterial} dispose={null} />
        <Summit />
      </group>
      <group ref={shelfRoot}>
        {resources.shelves.map((geometry, index) => (
          <mesh key={index} ref={(mesh) => { shelfMeshes.current[index] = mesh }} geometry={geometry} material={resources.shelfMaterial} dispose={null} />
        ))}
      </group>
      <group ref={sceneryRoot}>
        {resources.forest.map((geometry, index) => (
          <instancedMesh key={index} ref={(mesh) => { trees.current[index] = mesh }} args={[geometry, resources.forestMaterial, SHELF_SECTION_COUNT * 4]} frustumCulled={false} dispose={null} />
        ))}
        <instancedMesh ref={crystals} args={[resources.crystal, resources.crystalMaterial, SHELF_SECTION_COUNT]} frustumCulled={false} dispose={null} />
        <instancedMesh ref={lakes} args={[null, null, SHELF_SECTION_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[1, 12, 6]} />
          <meshStandardMaterial color="#79b8ca" roughness={0.4} metalness={0.06} />
        </instancedMesh>
        <instancedMesh ref={clouds} args={[resources.cloud, resources.cloudMaterial, SHELF_SECTION_COUNT]} frustumCulled={false} dispose={null} />
        <instancedMesh ref={ridges} args={[resources.ridge, resources.ridgeMaterial, SHELF_SECTION_COUNT]} frustumCulled={false} dispose={null} />
      </group>
      <MountainSnow run={run} paused={paused} />
    </>
  )
}
