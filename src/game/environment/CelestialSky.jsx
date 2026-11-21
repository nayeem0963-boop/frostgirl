import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, Color } from 'three'
import { createTrackFrame, sampleSpiralTrack } from '../systems/spiralTrack'

const STAR_COUNT = 72

export function CelestialSky({ run }) {
  const root = useRef()
  const frame = useMemo(() => createTrackFrame(), [])
  const stars = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3)
    for (let index = 0; index < STAR_COUNT; index += 1) {
      const angle = index * 2.399963
      const height = 0.12 + ((index * 0.618034) % 1) * 0.76
      const radius = Math.sqrt(1 - height * height) * 158
      positions[index * 3] = Math.cos(angle) * radius
      positions[index * 3 + 1] = height * 158
      positions[index * 3 + 2] = Math.sin(angle) * radius
    }
    return positions
  }, [])
  const uniforms = useMemo(() => ({
    horizon: { value: new Color('#718d9e') },
    zenith: { value: new Color('#102848') },
    aurora: { value: new Color('#69d6cb') },
    violet: { value: new Color('#8e83c9') },
    moon: { value: new Color('#d8efff') },
    warmth: { value: new Color('#c59b80') },
  }), [])

  useFrame(() => {
    sampleSpiralTrack(run.state.distance, frame)
    root.current.position.set(frame.position.x, 0, frame.position.z)
  })

  return (
    <group ref={root}>
      <mesh renderOrder={-100} frustumCulled={false}>
        <sphereGeometry args={[165, 32, 16]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          uniforms={uniforms}
          vertexShader={'varying vec3 skyDirection; void main() { skyDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
          fragmentShader={`
            uniform vec3 horizon, zenith, aurora, violet, moon, warmth;
            varying vec3 skyDirection;
            void main() {
              vec3 direction = normalize(skyDirection);
              float elevation = max(direction.y, 0.0);
              vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.36, elevation));
              float angle = atan(direction.z, direction.x);
              float arc = 0.22 + 0.04 * sin(angle * 2.0) + 0.025 * sin(angle * 5.0 + 1.0);
              float veil = smoothstep(arc - 0.15, arc - 0.07, elevation)
                * (1.0 - smoothstep(arc + 0.10, arc + 0.25, elevation));
              float rays = pow(0.5 + 0.5 * sin(angle * 24.0 + sin(angle * 5.0) * 1.8), 3.0);
              color = mix(color, mix(aurora, violet, 0.25 + 0.15 * sin(angle * 3.0)), veil * (0.08 + 0.3 * rays));
              vec3 moonDirection = normalize(vec3(-0.94, 0.27, -0.28));
              float moonDot = dot(direction, moonDirection);
              float glow = pow(max(moonDot, 0.0), 1200.0) * 0.12;
              float disc = smoothstep(0.99965, 0.9998, moonDot);
              color = mix(color, moon, clamp(glow + disc * 0.96, 0.0, 1.0));
              vec3 horizonLight = normalize(vec3(0.35, 0.04, -0.94));
              float warm = pow(max(dot(direction, horizonLight), 0.0), 16.0)
                * (1.0 - smoothstep(0.0, 0.25, elevation));
              color = mix(color, warmth, warm * 0.22);
              gl_FragColor = vec4(color, 1.0);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }
          `}
        />
      </mesh>
      <points renderOrder={-90} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#dcecff" size={0.28} depthWrite={false} fog={false} />
      </points>
    </group>
  )
}
