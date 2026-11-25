// Aisha for the runner: the same rigged GLB and clips the expedition uses
// (public/assets/expedition/aisha.glb). Clip data was measured from the rig (see docs/FROST.md):
//  - `run`  stance foot ~4 m/s at 1x: playback rate follows ground speed (sim.runRate), so the feet keep pace.
//  - `land` (a Regular_Jump export): 0.54-1.12 s is the airborne part, 0.26-0.34 s the crouch (head top 1.18 m).
//  - `slide` drifts 1.3 m forward / 0.24 m sideways: never used here.
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three'
import { ASSETS } from '../../expedition/assets.js'
import { subclip } from '../../expedition/actors/Aisha.jsx'
import { runRate } from '../sim/sim.js'

// clip = clip name inside aisha.glb; range = sub-range in seconds.
export const RUNNER_STATES = {
  idle: { clip: 'idle', loop: true, fade: 0.25 },
  run: { clip: 'run', loop: true, fade: 0.14 },
  // jump pose is scrubbed by the physics (sim.airP 0..1), so the pose always matches the arc: no floating, no clamped hold
  air: { clip: 'land', loop: false, fade: 0.06, range: [0.54, 1.12], timeScale: 0, noLift: true },
  land: { clip: 'land', loop: false, fade: 0.05, range: [1.12, 1.42], timeScale: 1.5, noLift: true },
  // no dedicated duck clip exists: hold the crouch pose of the jump export
  duck: { clip: 'land', loop: false, fade: 0.09, range: [0.26, 0.34], timeScale: 1, noLift: false },
  hurt: { clip: 'land', loop: false, fade: 0.05, range: [0.26, 0.34], timeScale: 1, noLift: false },
}

export function RunnerAisha({ sim, debug }) {
  const gltf = useGLTF(ASSETS.aisha)
  const root = useRef()
  const tilt = useRef()
  const yaw = useRef()
  const lean = useRef()
  const cur = useRef({ name: '', action: null, roll: 0, turn: 0 })

  const { mixer, actions, scene, durations } = useMemo(() => {
    const scene = gltf.scene
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
    for (const [key, def] of Object.entries(RUNNER_STATES)) {
      const base = byName[def.clip] ?? byName.idle
      const clip = def.range ? subclip(base, key, def.range, def.noLift) : base
      durations[key] = clip.duration
      const a = mixer.clipAction(clip)
      a.setLoop(def.loop ? LoopRepeat : LoopOnce, Infinity)
      a.clampWhenFinished = !def.loop
      actions[key] = a
    }
    return { mixer, actions, scene, durations }
  }, [gltf])
  useEffect(() => () => mixer.stopAllAction(), [mixer])

  useFrame((_, raw) => {
    const s = sim.current
    if (!s || !root.current) return
    const dt = s.paused ? 0 : Math.min(raw, 0.05)
    const c = cur.current
    root.current.position.set(s.x, s.y, s.knock) // knock-back after a hit moves her toward the camera

    const want = RUNNER_STATES[s.anim] ? s.anim : 'run'
    if (want !== c.name) {
      const def = RUNNER_STATES[want]
      const next = actions[want]
      next.reset()
      next.enabled = true
      next.setEffectiveWeight(1)
      next.setEffectiveTimeScale(def.timeScale ?? 1)
      if (c.action) next.crossFadeFrom(c.action, def.fade, false)
      next.play()
      c.action = next
      c.name = want
    }
    if (c.name === 'run') { c.action.setEffectiveTimeScale(runRate(s.speed)); if (debug) debug.runRate = c.action.getEffectiveTimeScale() }
    if (debug) { debug.pose = c.name; debug.pos = [root.current.position.x, root.current.position.y, root.current.position.z] }
    if (c.name === 'air') c.action.time = Math.min(durations.air - 0.001, s.airP * durations.air)

    // purely visual body language
    const k = Math.min(1, dt * 14)
    const targetRoll = Math.max(-0.2, Math.min(0.2, -s.vx * 0.009)) // lean into the lane change
    const targetTurn = Math.atan2(s.vx, Math.max(s.speed, 4)) * 0.8 // head slightly toward the new lane
    c.roll += (targetRoll - c.roll) * k
    c.turn += (targetTurn - c.turn) * k
    tilt.current.rotation.z = c.roll
    yaw.current.rotation.y = Math.PI - c.turn
    lean.current.rotation.x = s.phase === 'gameover' ? -0.38 * s.knock : s.duckT * 0.2
    mixer.update(dt)
  })

  return (
    // The mesh faces +z at yaw 0; the runner heads toward -z. root -> tilt (roll) -> yaw -> lean (pitch) -> model
    <group ref={root}>
      <group ref={tilt}>
        <group ref={yaw} rotation={[0, Math.PI, 0]}>
          <group ref={lean}>
            <primitive object={scene} />
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload(ASSETS.aisha)
