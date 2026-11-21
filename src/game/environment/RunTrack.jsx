import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TRACK_CENTER_Z, TRACK_LENGTH, TRACK_SURFACE_Y } from '../systems/runGeometry'
import { configureDistanceFade } from '../systems/distanceFade'
import { SEAM_ROWS, SEAM_SPACING, TRACK_DETAIL_CYCLE, trackDetailPosition } from '../systems/trackMotion'

const markRows = 64

function createIceCrack() {
  const parts = [
    new PlaneGeometry(0.48, 0.022).rotateZ(-0.22).translate(-0.22, 0.045, 0),
    new PlaneGeometry(0.52, 0.022).rotateZ(0.13).translate(0.25, 0.025, 0),
    new PlaneGeometry(0.3, 0.016).rotateZ(0.7).translate(-0.13, 0.15, 0),
    new PlaneGeometry(0.32, 0.016).rotateZ(-0.6).translate(0.23, -0.07, 0),
  ]
  const geometry = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())
  return geometry
}

export function RunTrack({ run, laneSpacing, palette }) {
  const marks = useRef()
  const guides = useRef()
  const drifts = useRef()
  const seams = useRef()
  const transform = useRef()
  const crackGeometry = useMemo(() => createIceCrack(), [])
  const fadeInDistance = useMemo(() => (shader) => configureDistanceFade(shader, run.settings), [run])

  useEffect(() => () => crackGeometry.dispose(), [crackGeometry])

  useLayoutEffect(() => {
    const dummy = new Object3D()
    transform.current = dummy
    dummy.rotation.x = -Math.PI / 2
    for (let index = 0; index < markRows; index += 1) {
      for (let side = 0; side < 2; side += 1) {
        dummy.position.set((side - 0.5) * laneSpacing, -0.02, 10 - index * 2.5)
        dummy.updateMatrix()
        marks.current.setMatrixAt(index * 2 + side, dummy.matrix)
      }
    }
    marks.current.instanceMatrix.needsUpdate = true
    for (let index = 0; index < 4; index += 1) {
      dummy.position.set((index - 1.5) * laneSpacing, -0.01, TRACK_CENTER_Z)
      dummy.updateMatrix()
      guides.current.setMatrixAt(index, dummy.matrix)
    }
    guides.current.instanceMatrix.needsUpdate = true
  }, [laneSpacing])

  useFrame(() => {
    marks.current.position.z = run.state.distance % 2.5
    const dummy = transform.current
    if (!dummy) return
    dummy.rotation.set(-Math.PI / 2, 0, 0)
    for (let index = 0; index < 24; index += 1) {
      const z = trackDetailPosition(index * TRACK_DETAIL_CYCLE / 24, run.state.distance)
      dummy.position.set(Math.sin(index * 17.3) * 2.1, -0.025, z)
      dummy.scale.set(0.13 + (index % 4) * 0.06, 0.45 + (index % 3) * 0.2, 1)
      dummy.updateMatrix()
      drifts.current.setMatrixAt(index, dummy.matrix)
    }
    drifts.current.instanceMatrix.needsUpdate = true
    for (let row = 0; row < SEAM_ROWS; row += 1) {
      const z = trackDetailPosition(row * SEAM_SPACING, run.state.distance)
      for (let lane = -1; lane <= 1; lane += 1) {
        const variation = row * 1.7 + lane * 1.3
        dummy.position.set(lane * laneSpacing + Math.sin(variation) * 0.16, TRACK_SURFACE_Y + 0.012, z + Math.sin(variation) * 0.3)
        dummy.rotation.set(-Math.PI / 2, 0, Math.sin(variation) * 0.17)
        const scale = 0.45 + (row + lane + 1) % 4 * 0.1
        dummy.scale.set(scale, scale, 1)
        dummy.updateMatrix()
        seams.current.setMatrixAt(row * 3 + lane + 1, dummy.matrix)
      }
    }
    seams.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={marks} args={[null, null, markRows * 2]} renderOrder={2}>
        <planeGeometry args={[0.07, 0.85]} />
        <meshBasicMaterial color="#91bfca" transparent opacity={0.18} depthWrite={false} fog={false} onBeforeCompile={fadeInDistance} />
      </instancedMesh>
      <instancedMesh ref={guides} args={[null, null, 4]} renderOrder={2}>
        <planeGeometry args={[0.035, TRACK_LENGTH]} />
        <meshBasicMaterial color={palette.snow} transparent opacity={0.16} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={drifts} args={[null, null, 24]} frustumCulled={false} renderOrder={2}>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial color="#f4fbff" transparent opacity={0.16} depthWrite={false} fog={false} onBeforeCompile={fadeInDistance} />
      </instancedMesh>
      <instancedMesh ref={seams} args={[crackGeometry, null, SEAM_ROWS * 3]} frustumCulled={false} renderOrder={2}>
        <meshBasicMaterial color="#d5f1f3" transparent opacity={0.23} depthWrite={false} fog={false} onBeforeCompile={fadeInDistance} />
      </instancedMesh>
    </>
  )
}
