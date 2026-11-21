import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BackSide, Color, ConeGeometry, DynamicDrawUsage, Object3D } from 'three'
import { configureDistanceFade } from '../systems/distanceFade'
import { SEGMENT_COUNT, SEGMENT_LENGTH, segmentPosition } from '../systems/trackMotion'
import { mountainPlacement } from './mountainLayout'

const PEAK_COUNT = SEGMENT_COUNT * 2
const PEAKS = Array.from({ length: PEAK_COUNT }, (_, index) => mountainPlacement(index))

function configureMountainFade(shader, settings) {
  configureDistanceFade(shader, settings)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float mountainNearFade;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nmountainNearFade = smoothstep(55.0, 85.0, journeyPlayerZ - (modelMatrix * instanceMatrix[3]).z);')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float mountainNearFade;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= mountainNearFade;')
}

function mountainGeometry(snow) {
  const geometry = new ConeGeometry(1, 1, 9, 1, true)
  const position = geometry.attributes.position
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const z = position.getZ(index)
    const angle = Math.atan2(z, x)
    const variation = 1 + 0.18 * Math.cos(angle * 3) + 0.1 * Math.sin(angle * 2)
    position.setX(index, x * variation)
    position.setZ(index, z * variation)
    if (snow && position.getY(index) < 0) {
      const y = -0.5 + 0.12 * Math.sin(angle * 3 + 0.5)
      position.setY(index, y)
      position.setX(index, position.getX(index) * (0.5 - y))
      position.setZ(index, position.getZ(index) * (0.5 - y))
    }
  }
  geometry.computeVertexNormals()
  return geometry
}

export function WinterSky({ run }) {
  const mountains = useRef()
  const snow = useRef()
  const geometry = useMemo(() => mountainGeometry(false), [])
  const snowGeometry = useMemo(() => mountainGeometry(true), [])
  const transform = useMemo(() => new Object3D(), [])
  const fade = useMemo(() => (shader) => configureMountainFade(shader, run.settings), [run])
  const uniforms = useMemo(() => ({
    horizon: { value: new Color('#c0dbe2') },
    zenith: { value: new Color('#365e7d') },
  }), [])

  useEffect(() => () => {
    geometry.dispose()
    snowGeometry.dispose()
  }, [geometry, snowGeometry])

  useLayoutEffect(() => {
    const color = new Color()
    mountains.current.instanceMatrix.setUsage(DynamicDrawUsage)
    snow.current.instanceMatrix.setUsage(DynamicDrawUsage)
    for (let index = 0; index < PEAK_COUNT; index += 1) {
      mountains.current.setColorAt(index, color.set(['#b9cfda', '#d2e3e7', '#c4d5dc'][index % 3]))
    }
    mountains.current.instanceColor.needsUpdate = true
  }, [])

  useFrame(() => {
    for (let index = 0; index < PEAK_COUNT; index += 1) {
      const segment = Math.floor(index / 2)
      const { x, height, radius, depth, localZ, rotation } = PEAKS[index]
      const z = segmentPosition(segment, run.state.distance) + SEGMENT_LENGTH / 2 + localZ
      transform.position.set(x, height / 2 - 2, z)
      transform.scale.set(radius, height, radius * depth)
      transform.rotation.set(0, rotation, 0)
      transform.updateMatrix()
      mountains.current.setMatrixAt(index, transform.matrix)
      transform.position.set(x, height * 0.77 - 2, z)
      transform.scale.set(radius * 0.49, height * 0.46, radius * depth * 0.49)
      transform.updateMatrix()
      snow.current.setMatrixAt(index, transform.matrix)
    }
    mountains.current.instanceMatrix.needsUpdate = true
    snow.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <mesh renderOrder={-100} frustumCulled={false}>
        <sphereGeometry args={[180, 32, 16]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          uniforms={uniforms}
          vertexShader={'varying vec3 skyPosition; void main() { skyPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'}
          fragmentShader={'uniform vec3 horizon; uniform vec3 zenith; varying vec3 skyPosition; void main() { float t = smoothstep(-0.15, 0.75, normalize(skyPosition).y); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'}
        />
      </mesh>
      <instancedMesh ref={mountains} args={[geometry, null, PEAK_COUNT]} frustumCulled={false}>
        <meshStandardMaterial color="#a2c2d0" roughness={1} fog={false} transparent alphaTest={0.01} depthWrite onBeforeCompile={fade} />
      </instancedMesh>
      <instancedMesh ref={snow} args={[snowGeometry, null, PEAK_COUNT]} frustumCulled={false}>
        <meshStandardMaterial color="#d5e8ef" roughness={1} fog={false} transparent alphaTest={0.01} depthWrite onBeforeCompile={fade} />
      </instancedMesh>
    </>
  )
}
