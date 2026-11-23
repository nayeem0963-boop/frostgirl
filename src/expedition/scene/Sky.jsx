import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, Color, ShaderMaterial, Vector3 } from 'three'

export const SUN_DIR = new Vector3(-0.42, 0.36, 0.83).normalize() // low afternoon sun, behind-left of the climb
export const FOG_COLOR = new Color('#c9d6e3')

export function Sky() {
  const ref = useRef()
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: SUN_DIR },
      uZenith: { value: new Color('#5b82b4') },
      uMid: { value: new Color('#9db7d4') },
      uHorizon: { value: new Color('#dde5ee') },
      uSunColor: { value: new Color('#fff1d6') },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w; // always at the far plane
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uZenith, uMid, uHorizon, uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uZenith, smoothstep(0.2, 0.85, h));
        col = mix(col, uHorizon * 0.96, smoothstep(0.02, -0.15, h));
        float s = max(dot(d, normalize(uSun)), 0.0);
        col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.08);
        // high thin cloud bands
        float band = sin(d.x * 9.0 + d.z * 4.0) * sin(d.z * 7.0 - d.x * 3.0);
        col = mix(col, vec3(0.93, 0.95, 0.98), smoothstep(0.55, 1.0, band) * smoothstep(0.08, 0.35, h) * 0.18);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), [])
  useFrame(({ camera }) => { if (ref.current) ref.current.position.copy(camera.position) })
  return (
    <mesh ref={ref} material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[5000, 32, 16]} />
    </mesh>
  )
}
