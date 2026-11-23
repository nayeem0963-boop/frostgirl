// Dev-only asset check: ?game=frost&viewer=aisha|wolf&clip=walk&t=0.4
// Renders the model posed at a clip time (or playing when t is omitted)
// and lists every clip found in the GLB.
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { AnimationMixer, Box3, Vector3 } from 'three'
import { ASSETS } from '../assets.js'

function Model({ url, clip, t }) {
  const gltf = useGLTF(url)
  const { mixer, scene, height } = useMemo(() => {
    const scene = gltf.scene
    const mixer = new AnimationMixer(scene)
    const c = gltf.animations.find((a) => a.name === clip) ?? gltf.animations[0]
    if (c) mixer.clipAction(c).play()
    if (t != null) mixer.setTime(t)
    const box = new Box3().setFromObject(scene)
    return { mixer, scene, height: box.getSize(new Vector3()).y }
  }, [gltf, clip, t])
  useFrame((_, dt) => { if (t == null) mixer.update(dt) })
  window.__clips = gltf.animations.map((a) => `${a.name} (${a.duration.toFixed(2)}s, ${a.tracks.length} tracks)`)
  window.__height = height
  return <primitive object={scene} />
}

export default function ClipViewer() {
  const q = new URLSearchParams(window.location.search)
  const which = ASSETS[q.get('viewer')] ? q.get('viewer') : 'aisha'
  const t = q.has('t') ? Number(q.get('t')) : null
  const yaw = Number(q.get('yaw') ?? 0.6)
  const dist = Number(q.get('dist') ?? (which === 'wolf' ? 3.2 : 3.4))
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#9fb3c8' }}>
      <Canvas camera={{ position: [Math.sin(yaw) * dist, 1.1, Math.cos(yaw) * dist], fov: 40 }}>
        <hemisphereLight args={['#dfeaff', '#556', 1.4]} />
        <directionalLight position={[3, 5, 4]} intensity={2} />
        <gridHelper args={[6, 12]} />
        <Model url={ASSETS[which]} clip={q.get('clip')} t={t} />
        <OrbitControls target={[0, which === 'wolf' ? 0.5 : 0.9, 0]} />
      </Canvas>
    </div>
  )
}
