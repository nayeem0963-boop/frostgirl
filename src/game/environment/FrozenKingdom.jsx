import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { DynamicDrawUsage, Object3D } from 'three'
import { TRACK_SURFACE_Y } from '../systems/runGeometry'
import { SEGMENT_COUNT, SEGMENT_LENGTH, segmentPosition } from '../systems/trackMotion'
import { configureIceSurface, createSnowSegment, createSnowTexture } from './frozenTerrain'
import { FrozenScenery } from './FrozenScenery'
import { VillageStructures } from './VillageStructures'
import { WinterSky } from './WinterSky'

export function FrozenKingdom({ run }) {
  const ground = useRef()
  const transform = useMemo(() => new Object3D(), [])
  const geometry = useMemo(() => createSnowSegment(), [])
  const texture = useMemo(() => createSnowTexture(), [])

  useLayoutEffect(() => {
    ground.current.instanceMatrix.setUsage(DynamicDrawUsage)
  }, [])

  useEffect(() => () => {
    geometry.dispose()
    texture.dispose()
  }, [geometry, texture])

  useFrame(() => {
    for (let index = 0; index < SEGMENT_COUNT; index += 1) {
      transform.position.set(0, TRACK_SURFACE_Y, segmentPosition(index, run.state.distance) + SEGMENT_LENGTH / 2)
      transform.updateMatrix()
      ground.current.setMatrixAt(index, transform.matrix)
    }
    ground.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <WinterSky run={run} />
      <instancedMesh ref={ground} args={[geometry, null, SEGMENT_COUNT]} frustumCulled={false}>
        <meshStandardMaterial vertexColors color="#c0d7df" map={texture} roughness={0.92} onBeforeCompile={configureIceSurface} />
      </instancedMesh>
      <FrozenScenery run={run} />
      <VillageStructures run={run} />
    </>
  )
}
