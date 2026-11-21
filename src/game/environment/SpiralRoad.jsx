import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MeshStandardMaterial, Vector3 } from 'three'
import {
  createTrackFrame, sampleSpiralTrack, SPIRAL_SECTION_COUNT, SPIRAL_SECTION_LENGTH,
} from '../systems/spiralTrack'
import { createSpiralSection, updateSpiralSection } from './spiralGeometry'

export function SpiralRoad({ run }) {
  const root = useRef()
  const meshes = useRef([])
  const assigned = useRef(Array(SPIRAL_SECTION_COUNT).fill(null))
  const resources = useMemo(() => ({
    geometries: Array.from({ length: SPIRAL_SECTION_COUNT }, createSpiralSection),
    material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08 }),
    frame: createTrackFrame(),
    anchor: new Vector3(),
    point: new Vector3(),
  }), [])

  useEffect(() => () => {
    resources.geometries.forEach((geometry) => geometry.dispose())
    resources.material.dispose()
  }, [resources])

  useFrame(() => {
    const { geometries, frame, anchor, point } = resources
    const current = Math.floor(run.state.distance / SPIRAL_SECTION_LENGTH)
    for (let offset = -Math.floor(SPIRAL_SECTION_COUNT / 2); offset < Math.ceil(SPIRAL_SECTION_COUNT / 2); offset += 1) {
      const section = current + offset
      const slot = ((section % SPIRAL_SECTION_COUNT) + SPIRAL_SECTION_COUNT) % SPIRAL_SECTION_COUNT
      if (assigned.current[slot] !== section) {
        updateSpiralSection(geometries[slot], section, anchor, frame, point)
        meshes.current[slot].position.copy(anchor)
        assigned.current[slot] = section
      }
    }
    sampleSpiralTrack(run.state.distance, frame)
    root.current.position.y = -frame.position.y
  })

  return (
    <group ref={root}>
      {resources.geometries.map((geometry, index) => (
        <mesh key={index} ref={(mesh) => { meshes.current[index] = mesh }} geometry={geometry} material={resources.material} dispose={null} />
      ))}
    </group>
  )
}
