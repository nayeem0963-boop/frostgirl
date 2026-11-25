import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, InstancedMesh, MeshStandardMaterial,
  Object3D, OctahedronGeometry, PointsMaterial, ShaderMaterial,
} from 'three'
import { LEVEL } from '../world/level.js'
import { getRockAssets } from './Rocks.jsx'
import { getSnowflakeTexture } from './textures.js'

/** Wind-blown snowfall in a box that follows the camera. */
export function Snowfall({ count = 1600, paused, color = '#ffffff' }) {
  const ref = useRef()
  const { geometry, seeds } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60
      pos[i * 3 + 1] = Math.random() * 30
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60
      seeds[i] = Math.random()
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    return { geometry: g, seeds }
  }, [count])
  const material = useMemo(() => new PointsMaterial({
    size: 0.09, map: getSnowflakeTexture(), transparent: true, opacity: 0.9, depthWrite: false, color, sizeAttenuation: true,
  }), [color])
  useFrame(({ camera, clock }, raw) => {
    if (paused) return
    const dt = Math.max(0, Math.min(raw, 0.05))
    const p = geometry.attributes.position.array
    const t = clock.elapsedTime
    const cx = camera.position.x
    const cy = camera.position.y
    const cz = camera.position.z
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      let x = p[i * 3] + (1.4 + Math.sin(t * 0.3 + s * 6) * 0.8) * dt
      let y = p[i * 3 + 1] - (0.7 + s * 0.6) * dt
      let z = p[i * 3 + 2] + Math.cos(t * 0.5 + s * 9) * 0.4 * dt
      // wrap around the camera
      const rx = x - cx
      const rz = z - cz
      if (rx > 30) x -= 60; else if (rx < -30) x += 60
      if (rz > 30) z -= 60; else if (rz < -30) z += 60
      if (y < cy - 12) y += 30; else if (y > cy + 18) y -= 30
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z
    }
    geometry.attributes.position.needsUpdate = true
  })
  return <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />
}

/**
 * The frost phenomenon: a boulder split by glowing ice crystals, with cold
 * motes drifting up from it. A pale figure is glimpsed on the ridge once.
 */
export function FrostAnomaly({ world, sim }) {
  const fs = LEVEL.frostStone
  const y = world.height(fs.x, fs.z)
  const light = useRef()
  const motes = useRef()
  const spirit = useRef()
  const crystals = useMemo(() => {
    const m = new InstancedMesh(
      new OctahedronGeometry(1, 0).scale(0.18, 1, 0.18),
      new MeshStandardMaterial({ color: '#bfe9ff', emissive: '#4fb8ff', emissiveIntensity: 2.2, roughness: 0.15, transparent: true, opacity: 0.9 }),
      9,
    )
    const d = new Object3D()
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39
      d.position.set(Math.cos(a) * (0.5 + (i % 3) * 0.25), 1.2 + (i % 4) * 0.2, Math.sin(a) * (0.5 + (i % 3) * 0.2))
      d.rotation.set(Math.cos(a) * 0.6, a, Math.sin(a) * 0.6)
      d.scale.setScalar(0.7 + (i % 3) * 0.35)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    return m
  }, [])
  const moteGeo = useMemo(() => {
    const n = 90
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6
      pos[i * 3 + 1] = Math.random() * 5
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    return g
  }, [])
  const moteMat = useMemo(() => new PointsMaterial({
    size: 0.16, map: getSnowflakeTexture(), color: new Color('#8fd8ff'), transparent: true, opacity: 0.85,
    blending: AdditiveBlending, depthWrite: false,
  }), [])
  const spiritMat = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform float uTime; uniform float uAlpha;
      void main(){
        vec2 p = vUv - vec2(0.5, 0.0);
        float sway = sin(vUv.y * 6.0 + uTime * 1.5) * 0.03;
        float body = smoothstep(0.18, 0.0, abs(p.x + sway) - 0.06 * (1.0 - vUv.y) - 0.02) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
        float head = smoothstep(0.09, 0.0, length(vec2(p.x + sway, vUv.y - 0.8)) - 0.04);
        float a = max(body * 0.6, head) * uAlpha;
        gl_FragColor = vec4(vec3(0.7, 0.88, 1.0) * a, a);
      }`,
  }), [])

  useFrame(({ clock, camera }, raw) => {
    const t = clock.elapsedTime
    const dt = Math.max(0, Math.min(raw, 0.05))
    if (spirit.current) {
      const o = spirit.current.position
      spirit.current.rotation.y = Math.atan2(camera.position.x - o.x, camera.position.z - o.z)
    }
    if (light.current) light.current.intensity = 9 + Math.sin(t * 2.3) * 3 + Math.sin(t * 7.1) * 1.2
    if (motes.current) {
      const p = moteGeo.attributes.position.array
      for (let i = 0; i < p.length; i += 3) {
        p[i + 1] += dt * (0.35 + (i % 7) * 0.05)
        p[i] += Math.sin(t + i) * dt * 0.25
        if (p[i + 1] > 5) p[i + 1] = 0.3
      }
      moteGeo.attributes.position.needsUpdate = true
    }
    const s = sim.current?.spirit
    if (spirit.current && s) {
      spiritMat.uniforms.uTime.value = t
      spiritMat.uniforms.uAlpha.value = s.alpha
      spirit.current.visible = s.alpha > 0.01
      spirit.current.position.y = s.y + Math.sin(t * 0.8) * 0.3
    }
  })

  const rock = getRockAssets()
  const sp = LEVEL.spirit
  const spY = world.height(sp.x, sp.z)
  return (
    <group>
      <group position={[fs.x, y, fs.z]}>
        <mesh geometry={rock.geometries[1]} material={rock.material} scale={[1.5, 2.6, 1.3]} castShadow receiveShadow />
        <primitive object={crystals} />
        <pointLight ref={light} color="#6cc7ff" intensity={10} distance={14} decay={2} position={[0, 2.2, 0]} />
        <points ref={motes} geometry={moteGeo} material={moteMat} />
      </group>
      <mesh ref={spirit} position={[sp.x, spY, sp.z]} material={spiritMat} visible={false}>
        <planeGeometry args={[2.2, 4.4]} />
      </mesh>
    </group>
  )
}
