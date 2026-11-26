// The original game's avatar: Aisha from the Meshy asset set (public/assets/expedition/aisha.glb), the same rigged model and
// clips the runner uses. Her real run cycle plays at a rate that follows the ground speed; the jump pose is scrubbed by the
// jump's progress so it always matches the arc; a slide holds the crouch pose. Movement, jump height and collisions are
// untouched: this only draws the character. Cosmetic only, like every skin.
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { ASSETS } from '../../expedition/assets.js'
import { subclip } from '../../expedition/actors/Aisha.jsx'
import { TRACK_SURFACE_Y } from '../systems/runGeometry'
import { lanePosition } from '../systems/runnerMovement'
import { MESHY_AISHA, MESHY_STATES, meshyRunRate, meshyState } from './meshyAishaConfig.js'

export function MeshyAisha({ movement, run, paused, resetVersion }) {
  const gltf = useGLTF(ASSETS.aisha)
  const root = useRef()
  const pose = useRef()
  const shadow = useRef()
  const cur = useRef({ name: '', action: null })
  const skipDelta = useRef(true)
  const invalidate = useThree((state) => state.invalidate)

  const { scene, mixer, actions, durations } = useMemo(() => {
    const scene = clone(gltf.scene)
    scene.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false // skinned: the bind-pose bounds are wrong while animated
        if (o.material) o.material.envMapIntensity = 0.85
      }
    })
    const mixer = new AnimationMixer(scene)
    const byName = Object.fromEntries(gltf.animations.map((c) => [c.name, c]))
    const actions = {}
    const durations = {}
    for (const [key, def] of Object.entries(MESHY_STATES)) {
      const base = byName[def.clip] ?? byName.idle
      const clip = def.range ? subclip(base, key, def.range, def.noLift) : base
      durations[key] = clip.duration
      const a = mixer.clipAction(clip)
      a.setLoop(def.loop ? LoopRepeat : LoopOnce, Infinity)
      a.clampWhenFinished = !def.loop
      actions[key] = a
    }
    return { scene, mixer, actions, durations }
  }, [gltf])
  useEffect(() => () => mixer.stopAllAction(), [mixer])

  useLayoutEffect(() => {
    if (paused) skipDelta.current = true
  }, [paused])

  useLayoutEffect(() => {
    skipDelta.current = true
    cur.current = { name: '', action: null }
    mixer.stopAllAction()
    root.current.position.set(0, TRACK_SURFACE_Y, run.settings.playerZ)
    pose.current.rotation.set(0, 0, 0)
    shadow.current.position.set(0, TRACK_SURFACE_Y + 0.006, run.settings.playerZ)
    shadow.current.material.opacity = 0.2
    invalidate()
  }, [resetVersion, invalidate, run.settings.playerZ, mixer])

  useFrame((_, delta) => {
    if (paused || run.state.hitType || run.state.stalled) return
    const step = skipDelta.current ? 0 : Math.min(delta, 0.05)
    skipDelta.current = false
    const { x, y, slideAmount } = movement.state
    root.current.position.x = x
    root.current.position.y = TRACK_SURFACE_Y + y
    shadow.current.position.x = x
    shadow.current.material.opacity = 0.2 * (1 - 0.55 * Math.min(y, 1))

    const c = cur.current
    const want = meshyState(movement.state, run.state)
    if (want !== c.name) {
      const def = MESHY_STATES[want]
      const next = actions[want]
      next.reset()
      next.enabled = true
      next.setEffectiveWeight(1)
      next.setEffectiveTimeScale(want === 'air' ? 0 : 1) // the jump pose is scrubbed below
      if (c.action) next.crossFadeFrom(c.action, def.fade, false)
      next.play()
      c.action = next
      c.name = want
    }
    if (c.name === 'run') c.action.setEffectiveTimeScale(meshyRunRate(run.state.speed))
    if (c.name === 'air') {
      const progress = Math.min(1, movement.state.actionTime / movement.settings.jumpDuration)
      c.action.time = Math.min(durations.air - 0.001, progress * durations.air)
    }
    mixer.update(step)

    // purely visual body language, same as AishaPreview: lean into a lane change
    const blend = 1 - Math.exp(-10 * step)
    const lean = Math.max(-0.15, Math.min(0.15, (x - lanePosition(movement.state.lane, movement.settings.laneSpacing)) * 0.2))
    pose.current.rotation.z += (lean - pose.current.rotation.z) * blend
    pose.current.rotation.x = 0.1 * slideAmount
  })

  return (
    <>
      <mesh ref={shadow} position={[0, TRACK_SURFACE_Y + 0.006, run.settings.playerZ]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.55, 0.3, 1]} renderOrder={2}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color="#315d72" transparent opacity={0.2} depthWrite={false} />
      </mesh>
      <group ref={root} position={[0, TRACK_SURFACE_Y, run.settings.playerZ]}>
        <group ref={pose}>
          <group rotation={[0, MESHY_AISHA.rotationY, 0]} scale={MESHY_AISHA.scale}>
            <primitive object={scene} dispose={null} />
          </group>
        </group>
      </group>
    </>
  )
}

useGLTF.preload(ASSETS.aisha)
