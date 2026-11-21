import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'

const COUNT = 100

export function Snowfall({ paused, run }) {
  const points = useRef()
  const wind = useRef(0)
  const positions = useMemo(() => {
    const values = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i += 1) {
      values[i * 3] = Math.sin(i * 42.7) * 10
      values[i * 3 + 1] = (i * 3.17) % 9
      values[i * 3 + 2] = -((i * 7.13) % 28) + 5
    }
    return values
  }, [])

  useFrame((_, delta) => {
    if (paused || run.state.hitType || run.state.stalled) return
    wind.current += Math.min(delta, 0.05)
    const attribute = points.current.geometry.attributes.position
    for (let i = 0; i < COUNT; i += 1) {
      attribute.array[i * 3] = Math.sin(i * 42.7) * 10
        + Math.sin(wind.current * 0.35 + i * 0.4) * 0.3
        + Math.sin(wind.current * (0.19 + i % 3 * 0.04) + i * 0.7) * 0.12
      const y = attribute.array[i * 3 + 1] - Math.min(delta, 0.05) * (0.48 + i % 5 * 0.06)
      attribute.array[i * 3 + 1] = y < 0 ? y + 9 : y
      attribute.array[i * 3 + 2] = ((28 - (i * 7.13) % 28 + run.state.distance) % 28) - 23
    }
    attribute.needsUpdate = true
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.065} transparent opacity={0.8} depthWrite={false} />
    </points>
  )
}
