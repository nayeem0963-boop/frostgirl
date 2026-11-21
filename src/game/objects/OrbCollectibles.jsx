import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, Object3D } from 'three'
import { RUN_POOL_SIZE } from '../systems/runSimulation'
import { CRYSTAL_HEIGHT, CRYSTAL_RADIUS } from '../systems/runGeometry'
import { lanePosition } from '../systems/runnerMovement'
import { createOrbHaloGeometry, createOrbParts, ORB_URL, setOrbTransform } from './orbGeometry'

function PlaceholderCollectibles({ run, laneSpacing, fadeInDistance }) {
  const mesh = useRef()
  const transform = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  const colors = useRef(Array(RUN_POOL_SIZE).fill(null))
  useFrame(() => {
    let colorsChanged = false
    for (let index = 0; index < RUN_POOL_SIZE; index += 1) {
      const crystal = run.state.collectibles[index]
      transform.position.set(lanePosition(crystal.lane, laneSpacing), CRYSTAL_HEIGHT, crystal.z)
      transform.rotation.set(0, run.state.distance * 0.8, 0)
      transform.scale.setScalar(crystal.active ? 1 : 0)
      transform.updateMatrix()
      mesh.current.setMatrixAt(index, transform.matrix)
      if (colors.current[index] !== crystal.color) {
        mesh.current.setColorAt(index, color.set(crystal.color))
        colors.current[index] = crystal.color
        colorsChanged = true
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (colorsChanged) mesh.current.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false}>
      <octahedronGeometry args={[CRYSTAL_RADIUS, 0]} />
      <meshStandardMaterial fog={false} transparent depthWrite={false} onBeforeCompile={fadeInDistance} color="#ffffff" emissive="#bf6e06" emissiveIntensity={0.45} metalness={0.2} roughness={0.25} />
    </instancedMesh>
  )
}

function OrbInstances({ run, laneSpacing, fadeInDistance }) {
  const { scene } = useGLTF(ORB_URL)
  const parts = useMemo(() => createOrbParts(scene, fadeInDistance), [scene, fadeInDistance])
  const meshes = useRef([])
  const core = useRef()
  const halo = useRef()
  const transform = useMemo(() => new Object3D(), [])
  const haloGeometry = useMemo(() => createOrbHaloGeometry(), [])

  useEffect(() => () => {
    for (const { geometry, material } of parts) {
      geometry.dispose()
      material.dispose()
    }
    haloGeometry.dispose()
  }, [parts, haloGeometry])

  useFrame(() => {
    for (let index = 0; index < RUN_POOL_SIZE; index += 1) {
      setOrbTransform(transform, run.state.collectibles[index], laneSpacing, run.state.distance)
      for (const mesh of meshes.current) mesh.setMatrixAt(index, transform.matrix)
      core.current.setMatrixAt(index, transform.matrix)
      halo.current.setMatrixAt(index, transform.matrix)
    }
    for (const mesh of meshes.current) mesh.instanceMatrix.needsUpdate = true
    core.current.instanceMatrix.needsUpdate = true
    halo.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      {parts.map((part, index) => (
        <instancedMesh
          key={part.material.uuid}
          ref={(mesh) => { meshes.current[index] = mesh }}
          args={[part.geometry, part.material, RUN_POOL_SIZE]}
          frustumCulled={false}
          dispose={null}
        />
      ))}
      <instancedMesh ref={core} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false}>
        <octahedronGeometry args={[0.14, 0]} />
        <meshBasicMaterial color="#fff4c4" fog={false} transparent depthWrite={false} onBeforeCompile={fadeInDistance} />
      </instancedMesh>
      <instancedMesh ref={halo} args={[haloGeometry, null, RUN_POOL_SIZE]} frustumCulled={false}>
        <meshBasicMaterial color="#ffe7ad" opacity={0.85} side={DoubleSide} forceSinglePass fog={false} transparent depthWrite={false} onBeforeCompile={fadeInDistance} />
      </instancedMesh>
    </>
  )
}

class OrbErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Collectible orb failed to load:', error)
    this.props.onError()
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

export function OrbCollectibles({ onError, ...props }) {
  const fallback = <PlaceholderCollectibles {...props} />
  return (
    <OrbErrorBoundary fallback={fallback} onError={onError}>
      <Suspense fallback={fallback}>
        <OrbInstances {...props} />
      </Suspense>
    </OrbErrorBoundary>
  )
}
