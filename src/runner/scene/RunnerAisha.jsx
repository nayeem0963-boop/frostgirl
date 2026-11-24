// Aisha for the runner: the same rigged GLB and clips the expedition uses
// (public/assets/expedition/aisha.glb), mapped to run / jump / fall / land / duck.
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three'
import { ASSETS } from '../../expedition/assets.js'
import { subclip } from '../../expedition/actors/Aisha.jsx'

// clip = clip name inside aisha.glb; range = sub-range in seconds (see docs/FROST.md "Asset inventory").
export const RUNNER_STATES = {
  idle: { clip: 'idle', loop: true, fade: 0.25 },
  run: { clip: 'run', loop: true, fade: 0.12 },
  jump: { clip: 'land', loop: false, fade: 0.08, range: [0.52, 0.86], timeScale: 1.1, noLift: true },
  fall: { clip: 'land', loop: false, fade: 0.15, range: [0.86, 1.06], timeScale: 0.35, noLift: true },
  land: { clip: 'land', loop: false, fade: 0.06, range: [1.1, 1.62], timeScale: 1.7, noLift: true },
  // no dedicated duck clip exists: hold the crouch pose of the jump export (t ~ 0.3 s)
  duck: { clip: 'land', loop: false, fade: 0.08, range: [0.26, 0.34], timeScale: 1, noLift: false },
  hurt: { clip: 'slide', loop: false, fade: 0.05, range: [0.05, 0.5], timeScale: 1.1, noLift: true },
}

export function RunnerAisha({ sim }) {
  const gltf = useGLTF(ASSETS.aisha)
  const root = useRef()
  const lean = useRef()
  const cur = useRef({ name: '', action: null })

  const { mixer, actions, scene } = useMemo(() => {
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
    for (const [key, def] of Object.entries(RUNNER_STATES)) {
      const base = byName[def.clip] ?? byName.idle
      const clip = def.range ? subclip(base, key, def.range, def.noLift) : base
      const a = mixer.clipAction(clip)
      a.setLoop(def.loop ? LoopRepeat : LoopOnce, Infinity)
      a.clampWhenFinished = !def.loop
      actions[key] = a
    }
    return { mixer, actions, scene }
  }, [gltf])
  useEffect(() => () => mixer.stopAllAction(), [mixer])

  useFrame((_, raw) => {
    const s = sim.current
    if (!s || !root.current) return
    const dt = s.paused ? 0 : Math.min(raw, 0.05)
    root.current.position.set(s.x, s.y, 0)
    const want = RUNNER_STATES[s.anim] ? s.anim : 'run'
    const c = cur.current
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
    if (c.name === 'run') c.action.setEffectiveTimeScale(Math.min(1.9, Math.max(1.2, s.speed / 9)))
    // a slight forward lean while ducking, into lane changes: purely visual
    const targetLean = c.name === 'duck' ? 0.3 : 0
    lean.current.rotation.x += (targetLean - lean.current.rotation.x) * Math.min(1, dt * 14)
    mixer.update(dt)
  })

  return (
    // The mesh faces +z at yaw 0; the runner heads toward -z.
    <group ref={root} rotation={[0, Math.PI, 0]}>
      <group ref={lean}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

useGLTF.preload(ASSETS.aisha)
