import { Box3, FrontSide, Matrix4, RingGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CRYSTAL_HEIGHT, CRYSTAL_RADIUS } from '../systems/runGeometry.js'
import { lanePosition } from '../systems/runnerMovement.js'

export const ORB_URL = '/assets/collectibles/orb_of_chi.glb'
const ORIGINAL_ORB_RADIUS = CRYSTAL_RADIUS * 0.9
const ORB_RADIUS = ORIGINAL_ORB_RADIUS * 1.22

export function createOrbHaloGeometry() {
  return new RingGeometry(0.41, 0.45, 40).rotateX(-Math.PI / 4)
}

export function createOrbParts(scene, fadeInDistance) {
  scene.updateWorldMatrix(true, true)
  const bounds = new Box3().setFromObject(scene)
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const largestDimension = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
    throw new Error('Collectible orb has invalid bounds')
  }
  const scale = 2 * ORB_RADIUS / largestDimension
  const normalize = new Matrix4().makeScale(scale, scale, scale)
    .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
  const groups = new Map()
  scene.traverse((object) => {
    if (!object.isMesh) return
    if (object.isSkinnedMesh || Array.isArray(object.material)) {
      throw new Error('Collectible orb contains an unsupported mesh')
    }
    const geometry = object.geometry.clone().applyMatrix4(
      new Matrix4().multiplyMatrices(normalize, object.matrixWorld),
    )
    const geometries = groups.get(object.material) || []
    geometries.push(geometry)
    groups.set(object.material, geometries)
  })
  if (groups.size === 0) throw new Error('Collectible orb has no meshes')

  const parts = []
  for (const [sourceMaterial, geometries] of groups) {
    const geometry = mergeGeometries(geometries)
    geometries.forEach((item) => item.dispose())
    if (!geometry) throw new Error('Collectible orb geometry could not be merged')
    const material = sourceMaterial.clone()
    material.side = FrontSide
    material.opacity = Math.min(0.7, material.opacity * 2.2)
    material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.8)
    material.depthWrite = false
    material.transparent = true
    material.fog = false
    material.onBeforeCompile = fadeInDistance
    parts.push({ geometry, material })
  }
  return parts
}

export function setOrbTransform(transform, crystal, laneSpacing, distance) {
  const phase = distance * 0.8
  const pulse = 1 + 0.02 * Math.sin(phase * 0.7)
  transform.position.set(
    lanePosition(crystal.lane, laneSpacing),
    CRYSTAL_HEIGHT + (ORB_RADIUS - ORIGINAL_ORB_RADIUS) + 0.012 * Math.sin(phase),
    crystal.z,
  )
  transform.rotation.set(0, phase, 0)
  transform.scale.setScalar(crystal.active ? pulse : 0)
  transform.updateMatrix()
}
