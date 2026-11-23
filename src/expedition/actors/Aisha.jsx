import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer, AnimationUtils, LoopOnce, LoopRepeat } from 'three'
import { ASSETS } from '../assets.js'

// Gameplay animation states -> clips actually present in aisha.glb.
// Sub-ranges (seconds) trim the long jump exports to the airborne part.
export const AISHA_STATES = {
  idle: { clip: 'idle', loop: true, fade: 0.3 },
  walk: { clip: 'walk', loop: true, fade: 0.25, speedRef: 1.5, min: 0.65, max: 1.6 },
  sprint: { clip: 'run', loop: true, fade: 0.22, speedRef: 4.8, min: 0.75, max: 1.3 },
  // Regular_Jump export (aisha.glb "land"): crouch 0.3s, take-off 0.65s, apex 0.8s, touch-down 1.15s.
  jump: { clip: 'land', loop: false, fade: 0.1, range: [0.52, 0.86], timeScale: 1.05, noLift: true },
  fall: { clip: 'land', loop: false, fade: 0.2, range: [0.86, 1.06], timeScale: 0.35, noLift: true },
  land: { clip: 'land', loop: false, fade: 0.08, range: [1.1, 1.62], timeScale: 1.45, noLift: true },
  // slide_right export starts with a stumble: reused as the hit reaction.
  hurt: { clip: 'slide', loop: false, fade: 0.1, range: [0.05, 0.5], timeScale: 1.1, noLift: true },
  // Gliding on ice: stand braced (idle) while momentum carries her.
  slide: { clip: 'idle', loop: true, fade: 0.3, timeScale: 0.6 },
  celebrate: { clip: 'celebrate', loop: true, fade: 0.4 },
}

function subclip(clip, name, [a, b], noLift) {
  const fps = 30
  const out = AnimationUtils.subclip(clip, name, Math.round(a * fps), Math.round(b * fps), fps)
  if (noLift) {
    // The jump exports raise the hips ~50 cm; physics already lifts Aisha, so
    // keep crouches (downward) but remove the baked upward lift.
    const t = out.tracks.find((tr) => tr.name === 'Hips.position')
    if (t) for (let i = 1; i < t.values.length; i += 3) t.values[i] = Math.min(t.values[i], 94)
  }
  return out
}

export function Aisha({ sim }) {
  const gltf = useGLTF(ASSETS.aisha)
  const root = useRef()
  const state = useRef({ current: null, name: '' })

  const { mixer, actions, scene } = useMemo(() => {
    const scene = gltf.scene
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
        o.frustumCulled = false
        if (o.material) { o.material.envMapIntensity = 0.85 }
      }
    })
    const mixer = new AnimationMixer(scene)
    const byName = Object.fromEntries(gltf.animations.map((c) => [c.name, c]))
    const actions = {}
    for (const [key, def] of Object.entries(AISHA_STATES)) {
      const base = byName[def.clip] ?? byName.idle ?? gltf.animations[0]
      if (!base) continue
      const clip = def.range ? subclip(base, key, def.range, def.noLift) : base
      const action = mixer.clipAction(clip)
      action.setLoop(def.loop ? LoopRepeat : LoopOnce, Infinity)
      action.clampWhenFinished = !def.loop
      actions[key] = action
    }
    return { mixer, actions, scene }
  }, [gltf])

  useEffect(() => () => mixer.stopAllAction(), [mixer])

  useFrame((_, rawDt) => {
    const p = sim.current?.player
    if (!p || !root.current) return
    const dt = sim.current.paused ? 0 : Math.max(0, Math.min(rawDt, 0.05))
    root.current.position.set(p.x, p.y, p.z)
    root.current.rotation.y = p.yaw
    const want = sim.current.celebrating ? 'celebrate' : p.hurtTimer > 0.35 && !p.grounded ? 'hurt' : p.anim
    const st = state.current
    if (want !== st.name && actions[want]) {
      const def = AISHA_STATES[want]
      const next = actions[want]
      next.reset()
      next.enabled = true
      next.setEffectiveWeight(1)
      next.setEffectiveTimeScale(def.timeScale ?? 1)
      if (st.current) next.crossFadeFrom(st.current, def.fade, false)
      next.play()
      st.current = next
      st.name = want
    }
    const def = AISHA_STATES[st.name]
    if (def?.speedRef && st.current) {
      const ts = Math.min(def.max, Math.max(def.min, p.speed / def.speedRef))
      st.current.setEffectiveTimeScale(ts)
    }
    mixer.update(dt)
  })

  return (
    <group ref={root}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload(ASSETS.aisha)
