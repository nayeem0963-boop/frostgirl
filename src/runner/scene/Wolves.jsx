// World 02's wolf (public/assets/expedition/wolf.glb: rigged, `run` and `walk` clips, ~10k triangles, faces +z, 1.62 m tall at
// scale 1). The collision is decided by the sim (obstacle kind 'wolf', whose collider follows the visible wolf, see sim.js);
// this only draws it: waiting at the edge of the trail, running into its lane, then holding there and facing the runner.
// Skinned meshes cannot be instanced, so a small pool of clones is reused (at most POOL wolves are ever on screen).
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AnimationMixer, Group } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ASSETS } from '../../expedition/assets.js'
import { LANES, WOLF } from '../config.js'
import { wolfProgress } from '../sim/sim.js'
import { groundY } from './scenery.js'

const POOL = 3
const FEET = 0.81 // model feet are 0.81 m below its origin (at scale 1)

export function Wolves({ sim }) {
  const { scene, animations } = useGLTF(ASSETS.wolf)
  const slots = useMemo(() => Array.from({ length: POOL }, () => {
    const root = new Group()
    const model = cloneSkinned(scene)
    model.scale.setScalar(WOLF.scale)
    model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false } })
    root.add(model)
    root.visible = false
    const mixer = new AnimationMixer(model)
    const actions = Object.fromEntries(animations.map((c) => [c.name, mixer.clipAction(c)]))
    for (const a of Object.values(actions)) a.play()
    return { root, mixer, actions, id: 0 }
  }), [scene, animations])
  useEffect(() => () => slots.forEach((s) => s.mixer.stopAllAction()), [slots])

  useFrame((_, raw) => {
    const s = sim.current
    const dt = s.paused ? 0 : Math.min(raw, 0.05)
    // the nearest few wolves still in front of (or just beside) the runner
    const live = s.obstacles.filter((o) => o.active && o.kind === 'wolf' && o.dist - s.dist > -3).sort((a, b) => a.dist - b.dist).slice(0, POOL)
    slots.forEach((slot, i) => {
      const o = live[i]
      slot.root.visible = !!o
      if (!o) return
      const ahead = o.dist - s.dist
      const t = wolfProgress(ahead)
      // heading: along the run across the trail while lunging, then turning to face the runner (+z)
      const dx = LANES[o.lane] - o.side * WOLF.sideX
      const yaw = Math.atan2(Math.sign(dx) * (1 - t), 0.5 * (1 - t) + t) // t=0: sideways; t=1: facing +z
      slot.root.position.set(o.x, groundY(o.x) + FEET * WOLF.scale, -ahead)
      slot.root.rotation.y = yaw
      // pacing at the edge, running during the lunge, holding a growling stance once it has arrived
      const running = t > 0 && t < 1
      slot.actions.run.setEffectiveWeight(running ? 1 : 0)
      slot.actions.walk.setEffectiveWeight(running ? 0 : 1)
      slot.actions.run.timeScale = 1.1
      slot.actions.walk.timeScale = t >= 1 ? 0.2 : 0.7
      slot.mixer.update(dt)
    })
  })

  return <>{slots.map((s, i) => <primitive key={i} object={s.root} />)}</>
}
