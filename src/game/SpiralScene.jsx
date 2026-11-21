import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, Vector3 } from 'three'
import { SpiralRoad } from './environment/SpiralRoad'
import { CrystalMountain } from './environment/CrystalMountain'
import { Player } from './player/Player'
import { RunLoop } from './systems/RunLoop'
import { TRACK_SURFACE_Y } from './systems/runGeometry'
import { configureRunnerCamera } from './systems/runnerCamera'
import { createSpiralCameraState, updateSpiralCamera } from './systems/spiralCamera'
import { createTrackFrame, sampleSpiralTrack, SPIRAL_FOG_END } from './systems/spiralTrack'

function SpiralPlayer({ run, ...props }) {
  const root = useRef()
  const resources = useMemo(() => ({
    frame: createTrackFrame(),
    backwards: new Vector3(),
    basis: new Matrix4(),
  }), [])

  useFrame(() => {
    const { frame, backwards, basis } = resources
    sampleSpiralTrack(run.state.distance, frame)
    root.current.position.copy(frame.position)
      .addScaledVector(frame.tangent, run.settings.playerZ)
      .addScaledVector(frame.up, -TRACK_SURFACE_Y)
    root.current.position.y -= frame.position.y
    backwards.copy(frame.tangent).negate()
    basis.makeBasis(frame.right, frame.up, backwards)
    root.current.quaternion.setFromRotationMatrix(basis)
  })
  return <group ref={root}><Player run={run} {...props} /></group>
}

function SpiralCamera({ run, resetVersion }) {
  const { camera, size, invalidate } = useThree()
  const snap = useRef(true)
  const state = useMemo(() => createSpiralCameraState(), [])

  useLayoutEffect(() => {
    configureRunnerCamera(camera, size, run.settings.playerZ)
    snap.current = true
    invalidate()
  }, [camera, size, run.settings.playerZ, resetVersion, invalidate])

  useFrame((_, delta) => {
    updateSpiralCamera(camera, state, run.state.distance, delta, snap.current)
    snap.current = false
  })
  return null
}

export function SpiralScene({ world, paused, movement, run, resetVersion, onCrystals, onHit, onPause, onStartMessage, onPreviewError }) {
  return (
    <>
      <color attach="background" args={['#718d9e']} />
      <fog attach="fog" args={['#718d9e', 75, SPIRAL_FOG_END]} />
      <hemisphereLight args={[world.lighting.ambient, '#527d9d', 1.7]} />
      <directionalLight position={[-5, 10, 5]} color={world.lighting.sun} intensity={2.5} />
      <RunLoop run={run} paused={paused} resetVersion={resetVersion} onCrystals={onCrystals} onHit={onHit} onPause={onPause} onStartMessage={onStartMessage} />
      <SpiralCamera run={run} resetVersion={resetVersion} />
      <CrystalMountain run={run} paused={paused} />
      <SpiralRoad run={run} />
      <SpiralPlayer movement={movement} run={run} paused={paused} resetVersion={resetVersion} onPreviewError={onPreviewError} />
    </>
  )
}
