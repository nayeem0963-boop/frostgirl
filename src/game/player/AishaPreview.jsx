import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { TRACK_SURFACE_Y } from '../systems/runGeometry'
import { lanePosition } from '../systems/runnerMovement'
import { CharacterModel } from './CharacterModel'
import { AISHA_PREVIEW } from './characterConfig'
import { runningPhase, sprintLift } from './aishaRig'

export function AishaPreview({ movement, run, paused, resetVersion }) {
  const root = useRef()
  const pose = useRef()
  const shadow = useRef()
  const skipDelta = useRef(true)
  const runningWeight = useRef(0)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    if (paused) skipDelta.current = true
  }, [paused])

  useLayoutEffect(() => {
    skipDelta.current = true
    runningWeight.current = 0
    root.current.position.set(0, TRACK_SURFACE_Y, run.settings.playerZ)
    pose.current.rotation.set(0, 0, 0)
    shadow.current.position.set(0, TRACK_SURFACE_Y + 0.006, run.settings.playerZ)
    shadow.current.material.opacity = 0.2
    invalidate()
  }, [resetVersion, invalidate, run.settings.playerZ])

  useFrame((_, delta) => {
    if (paused || run.state.hitType || run.state.stalled) return
    const step = skipDelta.current ? 0 : delta
    skipDelta.current = false
    const { x, y, action, slideAmount } = movement.state
    const target = run.state.started && action === 'running' ? 1 : 0
    runningWeight.current += (target - runningWeight.current) * (1 - Math.exp(-14 * step))
    const phase = runningPhase(run.state.distance)
    root.current.position.x = x
    // The tilt transition needs extra clearance before the full slide lift takes effect.
    root.current.position.y = TRACK_SURFACE_Y + y + AISHA_PREVIEW.slideLift * slideAmount
      + 0.1 * slideAmount * (1 - slideAmount)
      + sprintLift(phase) * runningWeight.current
    shadow.current.position.x = x
    shadow.current.material.opacity = 0.2 * (1 - 0.55 * Math.min(y, 1))
    pose.current.rotation.x = AISHA_PREVIEW.slideLean * slideAmount - 0.1 * runningWeight.current
    const blend = 1 - Math.exp(-10 * step)
    const lean = Math.max(-0.15, Math.min(0.15, (x - lanePosition(movement.state.lane, movement.settings.laneSpacing)) * 0.2))
    pose.current.rotation.z += (lean - pose.current.rotation.z) * blend
  })

  return (
    <>
      <mesh ref={shadow} position={[0, TRACK_SURFACE_Y + 0.006, run.settings.playerZ]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.55, 0.3, 1]} renderOrder={2}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color="#315d72" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <group ref={root} position={[0, TRACK_SURFACE_Y, run.settings.playerZ]}>
        <group ref={pose}>
          <CharacterModel config={AISHA_PREVIEW} movement={movement} run={run} paused={paused} resetVersion={resetVersion} />
        </group>
      </group>
    </>
  )
}
