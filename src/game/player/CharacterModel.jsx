import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { AnimationMixer } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { createAishaRig } from './aishaRig'

export function CharacterModel({ config, movement, run, paused, resetVersion }) {
  const gltf = useGLTF(config.url)
  const scene = useMemo(() => clone(gltf.scene), [gltf.scene])
  const mixer = useMemo(() => new AnimationMixer(scene), [scene])
  const rig = useMemo(() => createAishaRig(scene), [scene])
  const clip = useMemo(() => {
    const idle = gltf.animations.find((animation) => animation.name === config.idleClip)
    if (!idle) throw new Error(`Character animation "${config.idleClip}" was not found in ${config.url}`)
    return idle
  }, [config.idleClip, config.url, gltf.animations])
  const skipDelta = useRef(true)

  useLayoutEffect(() => {
    rig.reset()
    const action = mixer.clipAction(clip)
    action.reset().play()
    mixer.update(0)
    rig.apply(movement.state, run.state, movement.settings, 0)
    skipDelta.current = true
    return () => {
      rig.restore()
      action.stop()
      mixer.uncacheRoot(scene)
    }
  }, [clip, mixer, movement, rig, run, scene, resetVersion])

  useLayoutEffect(() => {
    if (paused) skipDelta.current = true
  }, [paused])

  useEffect(() => () => mixer.stopAllAction(), [mixer])

  useFrame((_, delta) => {
    if (paused || run.state.hitType || run.state.stalled) return
    const step = skipDelta.current ? 0 : delta
    rig.restore()
    mixer.update(step)
    rig.apply(movement.state, run.state, movement.settings, step)
    skipDelta.current = false
  })

  return (
    <group rotation={[0, config.rotationY, 0]} scale={config.scale}>
      <primitive object={scene} position={config.offset} dispose={null} />
    </group>
  )
}
