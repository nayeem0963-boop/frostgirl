import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer, Box3, LoopRepeat, Vector3 } from 'three'
import { useAsset } from '../../assets/index.js'

const BODY_LENGTH = 1.6 // metres, nose to tail base-ish

export function Wolf({ sim, world }) {
  const gltf = useAsset('wolf')
  const root = useRef()
  const body = useRef()
  const cur = useRef(null)

  const { scene, mixer, actions, hasClips } = useMemo(() => {
    const scene = gltf.scene
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
        o.frustumCulled = false
        if (o.material) o.material.envMapIntensity = 0.7
      }
    })
    // Normalise size and put the paws on y = 0. Skinned bounds depend on the
    // posed skeleton, so update bone matrices before measuring.
    const measure = () => {
      scene.updateMatrixWorld(true)
      scene.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.boundingBox = null } })
      return new Box3().setFromObject(scene)
    }
    scene.scale.setScalar(1)
    scene.position.set(0, 0, 0)
    const size = measure().getSize(new Vector3())
    const s = BODY_LENGTH / Math.max(size.x, size.z)
    scene.scale.setScalar(s)
    const box2 = measure()
    const c = box2.getCenter(new Vector3())
    scene.position.set(-c.x, -box2.min.y, -c.z)
    const byName = Object.fromEntries(gltf.animations.map((a) => [a.name, a]))
    const mixer = new AnimationMixer(scene)
    const actions = {}
    for (const name of ['walk', 'run']) {
      if (byName[name]) {
        actions[name] = mixer.clipAction(byName[name])
        actions[name].setLoop(LoopRepeat, Infinity)
      }
    }
    const hasClips = Object.keys(actions).length > 0
    if (!hasClips) console.warn('[Frost] wolf.glb has no walk/run clips — using static pose')
    return { scene, mixer, actions, hasClips }
  }, [gltf])

  useEffect(() => {
    if (actions.walk) { actions.walk.play(); cur.current = actions.walk }
    return () => mixer.stopAllAction()
  }, [actions, mixer])

  useFrame((state, rawDt) => {
    const w = sim.current?.wolf
    if (!w || !root.current) return
    const dt = sim.current.paused ? 0 : Math.max(0, Math.min(rawDt, 0.05))
    const y = world.height(w.x, w.z)
    root.current.position.set(w.x, y, w.z)
    root.current.rotation.y = w.yaw
    // Align body pitch with the slope under it.
    const ahead = world.height(w.x + Math.sin(w.yaw) * 0.7, w.z + Math.cos(w.yaw) * 0.7)
    const behind = world.height(w.x - Math.sin(w.yaw) * 0.7, w.z - Math.cos(w.yaw) * 0.7)
    const pitch = -Math.atan2(ahead - behind, 1.4)
    const warn = w.mode === 'warn'
    const crouch = warn ? 0.07 + Math.sin(state.clock.elapsedTime * 18) * 0.006 : 0
    body.current.rotation.x += (pitch + (warn ? 0.1 : 0) - body.current.rotation.x) * Math.min(1, dt * 8)
    body.current.position.y += (-crouch - body.current.position.y) * Math.min(1, dt * 10)

    if (!hasClips) return
    const wantRun = w.mode === 'charge' || (w.mode === 'retreat' && w.speed > 2.5)
    const next = wantRun && actions.run ? actions.run : actions.walk
    if (next && next !== cur.current) {
      next.reset().play()
      if (cur.current) next.crossFadeFrom(cur.current, 0.25, false)
      cur.current = next
    }
    if (cur.current) {
      const ref = cur.current === actions.run ? 6.5 : 1.25
      // Standing still (alert/warn) holds a poised frame instead of walking in place.
      const ts = w.speed < 0.05 ? 0 : Math.min(1.6, Math.max(0.35, w.speed / ref))
      cur.current.setEffectiveTimeScale(ts)
    }
    mixer.update(dt)
  })

  return (
    <group ref={root}>
      <group ref={body}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

