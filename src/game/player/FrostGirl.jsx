import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { lanePosition } from '../systems/runnerMovement'
import {
  PLAYER_BASE_Y, PLAYER_LEG_CENTER_Y, PLAYER_LEG_HIP_Y, PLAYER_LEG_LENGTH,
  PLAYER_LEG_RADIUS, PLAYER_MODEL_SCALE, TRACK_SURFACE_Y,
} from '../systems/runGeometry'

export function FrostGirl({ movement, run, paused, resetVersion }) {
  const root = useRef()
  const model = useRef()
  const leftArm = useRef()
  const rightArm = useRef()
  const leftLeg = useRef()
  const rightLeg = useRef()
  const shadow = useRef()
  const skipDelta = useRef(true)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    if (paused) skipDelta.current = true
  }, [paused])

  useLayoutEffect(() => {
    skipDelta.current = true
    root.current.position.set(0, PLAYER_BASE_Y, run.settings.playerZ)
    shadow.current.position.set(0, TRACK_SURFACE_Y + 0.006, run.settings.playerZ)
    shadow.current.material.opacity = 0.2
    model.current.scale.setScalar(PLAYER_MODEL_SCALE)
    model.current.rotation.x = 0
    model.current.rotation.z = 0
    leftArm.current.rotation.x = 0
    rightArm.current.rotation.x = 0
    leftLeg.current.rotation.x = 0
    rightLeg.current.rotation.x = 0
    invalidate()
  }, [resetVersion, invalidate, run.settings.playerZ])

  useFrame((_, delta) => {
    if (paused || run.state.hitType || run.state.stalled) return
    const step = skipDelta.current ? 0 : delta
    skipDelta.current = false
    const { x, y, action, slideAmount } = movement.state
    const phase = run.state.distance * 1.5
    root.current.position.x = x
    root.current.position.y = PLAYER_BASE_Y + y + (action === 'running' ? Math.abs(Math.sin(phase)) * 0.012 : 0)
    shadow.current.position.x = x
    shadow.current.material.opacity = 0.2 * (1 - 0.55 * Math.min(y, 1))
    model.current.scale.y = PLAYER_MODEL_SCALE * (1 - 0.45 * slideAmount)
    model.current.rotation.x = -0.35 * slideAmount
    const blend = 1 - Math.exp(-10 * step)
    const lean = Math.max(-0.15, Math.min(0.15, (x - lanePosition(movement.state.lane, movement.settings.laneSpacing)) * 0.2))
    model.current.rotation.z += (lean - model.current.rotation.z) * blend

    const stride = Math.sin(phase) * 0.4
    const jumping = action === 'jumping'
    leftArm.current.rotation.x += ((jumping ? -0.7 : stride * (1 - slideAmount)) - leftArm.current.rotation.x) * blend
    rightArm.current.rotation.x += ((jumping ? -0.7 : -stride * (1 - slideAmount)) - rightArm.current.rotation.x) * blend
    leftLeg.current.rotation.x += ((jumping ? 0.25 : -stride * (1 - slideAmount)) - leftLeg.current.rotation.x) * blend
    rightLeg.current.rotation.x += ((jumping ? 0.25 : stride * (1 - slideAmount)) - rightLeg.current.rotation.x) * blend
  })

  return (
    <>
      <mesh ref={shadow} position={[0, TRACK_SURFACE_Y + 0.006, run.settings.playerZ]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.55, 0.3, 1]} renderOrder={2}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color="#315d72" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <group ref={root} position={[0, PLAYER_BASE_Y, run.settings.playerZ]}>
        <group ref={model} scale={PLAYER_MODEL_SCALE}>
          <mesh position={[0, 1.12, 0]}>
            <coneGeometry args={[0.46, 1.05, 8]} />
            <meshStandardMaterial color="#4d9ac8" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.64, 0]}>
            <cylinderGeometry args={[0.45, 0.46, 0.1, 8]} />
            <meshStandardMaterial color="#d9f8ff" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.88, 0]}>
            <sphereGeometry args={[0.35, 16, 12]} />
            <meshStandardMaterial color="#f4d0c0" />
          </mesh>
          <mesh position={[0, 1.92, 0.08]} scale={[1.02, 1.06, 0.95]}>
            <sphereGeometry args={[0.36, 16, 12]} />
            <meshStandardMaterial color="#eaf9ff" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.56, 0.22]}>
            <capsuleGeometry args={[0.21, 0.48, 4, 8]} />
            <meshStandardMaterial color="#d9f4ff" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.24, 0]}>
            <coneGeometry args={[0.27, 0.32, 6]} />
            <meshStandardMaterial color="#90d5f1" metalness={0.25} roughness={0.4} />
          </mesh>
          <group ref={leftArm} position={[-0.32, 1.48, 0]}>
            <mesh position={[-0.12, -0.24, 0]} rotation={[0, 0, -0.25]}>
              <capsuleGeometry args={[0.1, 0.36, 4, 8]} />
              <meshStandardMaterial color="#8bcbe4" />
            </mesh>
          </group>
          <group ref={rightArm} position={[0.32, 1.48, 0]}>
            <mesh position={[0.12, -0.24, 0]} rotation={[0, 0, 0.25]}>
              <capsuleGeometry args={[0.1, 0.36, 4, 8]} />
              <meshStandardMaterial color="#8bcbe4" />
            </mesh>
          </group>
          <group ref={leftLeg} position={[-0.16, PLAYER_LEG_HIP_Y, 0]}>
            <mesh position={[0, PLAYER_LEG_CENTER_Y, 0]}>
              <capsuleGeometry args={[PLAYER_LEG_RADIUS, PLAYER_LEG_LENGTH, 4, 8]} />
              <meshStandardMaterial color="#365e87" />
            </mesh>
          </group>
          <group ref={rightLeg} position={[0.16, PLAYER_LEG_HIP_Y, 0]}>
            <mesh position={[0, PLAYER_LEG_CENTER_Y, 0]}>
              <capsuleGeometry args={[PLAYER_LEG_RADIUS, PLAYER_LEG_LENGTH, 4, 8]} />
              <meshStandardMaterial color="#365e87" />
            </mesh>
          </group>
        </group>
      </group>
    </>
  )
}
