import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D } from 'three'
import { obstacleTypes, RUN_POOL_SIZE } from '../systems/runSimulation'
import { TRACK_SURFACE_Y } from '../systems/runGeometry'
import { lanePosition } from '../systems/runnerMovement'
import { configureDistanceFade } from '../systems/distanceFade'
import { OrbCollectibles } from './OrbCollectibles'

const snowDirections = [
  [-0.9, -0.3], [-0.6, 0.6], [-0.25, -0.8],
  [0.25, 0.8], [0.6, -0.6], [0.9, 0.3],
]
const sparkleDirections = [[-1, 0], [1, 0], [0, -1], [0, 1]]

function setInstance(transform, mesh, index, visible, x, y, z, rotation = 0, tilt = 0) {
  transform.position.set(x, y, z)
  transform.rotation.set(0, rotation, tilt)
  transform.scale.setScalar(visible ? 1 : 0)
  transform.updateMatrix()
  mesh.setMatrixAt(index, transform.matrix)
}

export function RunObjects({ run, laneSpacing, onOrbError }) {
  const block = useRef()
  const barrier = useRef()
  const barrierSnow = useRef()
  const pineTrunk = useRef()
  const pineSnow = useRef()
  const pineBranches = useRef()
  const crystalMarkers = useRef()
  const effect = useRef()
  const sparkles = useRef()
  const snow = useRef()
  const dummy = useRef()
  const fadeInDistance = useMemo(() => (shader) => configureDistanceFade(shader, run.settings), [run])
  const fadeProps = { fog: false, transparent: true, depthWrite: false, onBeforeCompile: fadeInDistance }

  useLayoutEffect(() => {
    dummy.current = new Object3D()
  }, [])

  useFrame(() => {
    const transform = dummy.current
    if (!transform) return
    for (let index = 0; index < RUN_POOL_SIZE; index += 1) {
      const obstacle = run.state.obstacles[index]
      const x = lanePosition(obstacle.lane, laneSpacing)
      const z = obstacle.z
      setInstance(transform, block.current, index, obstacle.type === 'iceBlock', x, TRACK_SURFACE_Y + obstacleTypes.iceBlock.height / 2, z)
      setInstance(transform, barrier.current, index, obstacle.type === 'snowBarrier', x, TRACK_SURFACE_Y + (obstacleTypes.snowBarrier.height - 0.08) / 2, z)
      setInstance(transform, barrierSnow.current, index, obstacle.type === 'snowBarrier', x, TRACK_SURFACE_Y + obstacleTypes.snowBarrier.height - 0.04, z)
      setInstance(transform, pineTrunk.current, index, obstacle.type === 'fallenPine', x, TRACK_SURFACE_Y + 0.13, z, 0, Math.PI / 2)
      setInstance(transform, pineSnow.current, index, obstacle.type === 'fallenPine', x, TRACK_SURFACE_Y + 0.29, z)
      setInstance(transform, pineBranches.current, index * 2, obstacle.type === 'fallenPine', x - 0.22, TRACK_SURFACE_Y + 0.27, z)
      setInstance(transform, pineBranches.current, index * 2 + 1, obstacle.type === 'fallenPine', x + 0.22, TRACK_SURFACE_Y + 0.27, z)

      const crystal = run.state.collectibles[index]
      const crystalX = lanePosition(crystal.lane, laneSpacing)
      transform.position.set(crystalX, TRACK_SURFACE_Y + 0.005, crystal.z)
      transform.rotation.set(-Math.PI / 2, 0, 0)
      transform.scale.setScalar(crystal.active ? 1 : 0)
      transform.updateMatrix()
      crystalMarkers.current.setMatrixAt(index, transform.matrix)
    }

    block.current.instanceMatrix.needsUpdate = true
    barrier.current.instanceMatrix.needsUpdate = true
    barrierSnow.current.instanceMatrix.needsUpdate = true
    pineTrunk.current.instanceMatrix.needsUpdate = true
    pineSnow.current.instanceMatrix.needsUpdate = true
    pineBranches.current.instanceMatrix.needsUpdate = true
    crystalMarkers.current.instanceMatrix.needsUpdate = true

    const flash = run.state.effect
    effect.current.visible = flash.active
    sparkles.current.visible = flash.active
    if (flash.active) {
      const z = flash.z + run.state.distance - flash.distance
      const y = flash.y + 0.18 + flash.age * 0.35
      effect.current.position.set(flash.x, y, z)
      effect.current.scale.setScalar(1 + flash.age * 2.4)
      effect.current.material.opacity = Math.max(0, 1 - flash.age / 0.35)
      for (let index = 0; index < sparkleDirections.length; index += 1) {
        const [dx, dy] = sparkleDirections[index]
        const spread = 0.16 + flash.age * 0.55
        transform.position.set(flash.x + dx * spread, y + dy * spread, z)
        transform.rotation.set(0, 0, 0)
        transform.scale.setScalar(Math.max(0, 1 - flash.age / 0.5))
        transform.updateMatrix()
        sparkles.current.setMatrixAt(index, transform.matrix)
      }
      sparkles.current.instanceMatrix.needsUpdate = true
    }

    const puff = run.state.snowEffect
    snow.current.visible = puff.active
    if (puff.active) {
      const progress = Math.min(1, puff.age / 0.4)
      const spread = (puff.landing ? 0.6 : 0.4) * progress
      const z = run.settings.playerZ + run.state.distance - puff.distance
      for (let index = 0; index < snowDirections.length; index += 1) {
        const [dx, dz] = snowDirections[index]
        transform.position.set(puff.x + dx * spread, TRACK_SURFACE_Y + 0.04 + Math.sin(progress * Math.PI) * 0.12, z + dz * spread)
        transform.rotation.set(0, 0, 0)
        transform.scale.setScalar(1 - progress)
        transform.updateMatrix()
        snow.current.setMatrixAt(index, transform.matrix)
      }
      snow.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={block} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false}>
        <cylinderGeometry args={[0.32, obstacleTypes.iceBlock.width / 2, obstacleTypes.iceBlock.height, 5]} />
        <meshStandardMaterial {...fadeProps} color="#3885a7" emissive="#183f55" emissiveIntensity={0.25} roughness={0.35} metalness={0.15} />
      </instancedMesh>
      <instancedMesh ref={barrier} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false}>
        <boxGeometry args={[0.94, obstacleTypes.snowBarrier.height - 0.08, 0.32]} />
        <meshStandardMaterial {...fadeProps} color="#739db1" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={barrierSnow} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false}>
        <boxGeometry args={[obstacleTypes.snowBarrier.width, 0.08, obstacleTypes.snowBarrier.halfDepth * 2]} />
        <meshStandardMaterial {...fadeProps} color="#f4fbff" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={pineTrunk} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false}>
        <cylinderGeometry args={[0.13, 0.13, obstacleTypes.fallenPine.width, 7]} />
        <meshStandardMaterial {...fadeProps} color="#665d52" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={pineSnow} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false}>
        <boxGeometry args={[0.86, 0.06, 0.25]} />
        <meshStandardMaterial {...fadeProps} color="#f4fbff" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={pineBranches} args={[null, null, RUN_POOL_SIZE * 2]} frustumCulled={false}>
        <coneGeometry args={[0.15, 0.26, 5]} />
        <meshStandardMaterial {...fadeProps} color="#386c68" roughness={0.9} />
      </instancedMesh>
      <OrbCollectibles run={run} laneSpacing={laneSpacing} fadeInDistance={fadeInDistance} onError={onOrbError} />
      <instancedMesh ref={crystalMarkers} args={[null, null, RUN_POOL_SIZE]} frustumCulled={false} renderOrder={2}>
        <circleGeometry args={[0.26, 16]} />
        <meshBasicMaterial {...fadeProps} color="#927b4b" opacity={0.24} />
      </instancedMesh>
      <mesh ref={effect} visible={false} renderOrder={3}>
        <ringGeometry args={[0.2, 0.26, 16]} />
        <meshBasicMaterial color="#a8f3ec" transparent depthWrite={false} depthTest={false} />
      </mesh>
      <instancedMesh ref={sparkles} args={[null, null, sparkleDirections.length]} visible={false} frustumCulled={false} renderOrder={3}>
        <octahedronGeometry args={[0.045, 0]} />
        <meshBasicMaterial color="#c2fff5" depthTest={false} />
      </instancedMesh>
      <instancedMesh ref={snow} args={[null, null, snowDirections.length]} visible={false} frustumCulled={false}>
        <octahedronGeometry args={[0.055, 0]} />
        <meshBasicMaterial color="#effbff" />
      </instancedMesh>
    </>
  )
}
