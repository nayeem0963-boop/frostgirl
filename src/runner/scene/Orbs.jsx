// Orbs of Chi: instanced from src/assets/models/orb_of_chi.glb (2,440 triangles, no textures).
// The mesh is only decoration: collection is decided by the sim (sim.js collectOrbs).
import { useAsset } from '../../assets/index.js'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Box3, IcosahedronGeometry, InstancedMesh, Matrix4, Object3D, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ORBS } from '../config.js'


// The GLB's materials are 11-29% opaque (made for a dark background) and vanish against snow, so the runner restyles them:
// a saturated translucent shell, a bright core and opaque ice-white crystals, all lit from within.
const STYLE = {
  lambert2: { color: '#2db4f5', emissive: '#139dea', intensity: 1.1, opacity: 0.62 }, // outer shells
  lambert4: { color: '#f2fdff', emissive: '#8be8ff', intensity: 1.5, opacity: 1 }, // core
  lambert3: { color: '#c9efff', emissive: '#55c9ff', intensity: 0.9, opacity: 1 }, // crystals
  lambert5: { color: '#ffffff', emissive: '#a8ebff', intensity: 1.0, opacity: 1 },
}
function orbMaterial(source) {
  const m = source.clone()
  const st = STYLE[source.name]
  if (st) {
    m.color.set(st.color)
    m.emissive.set(st.emissive)
    m.emissiveIntensity = st.intensity
    m.opacity = st.opacity
    m.transparent = st.opacity < 1
    m.depthWrite = st.opacity >= 1
  }
  m.roughness = 0.25
  m.metalness = 0
  m.envMapIntensity = 0.9
  return m
}

/** The GLB's meshes merged per material, centred and scaled to the collision radius. */
function orbParts(scene) {
  scene.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(scene)
  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  const k = (ORBS.radius * 2 * 0.92) / Math.max(size.x, size.y, size.z)
  const normalise = new Matrix4().makeScale(k, k, k).multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
  const groups = new Map()
  const seenShell = new Set()
  scene.traverse((o) => {
    if (!o.isMesh) return
    // The three nested spheres are ~760 triangles each. Budget: the middle shell shares the outer shell's material and is
    // hidden inside it, so it is skipped; the outer shell and core are rebuilt as low-poly icospheres with the same
    // extents (the mesh is ~30 px on screen). The crystals are kept as authored. 2,440 -> ~560 triangles.
    const sphere = o.geometry.attributes.position.count > 200
    if (sphere && seenShell.has(o.material)) return
    if (sphere) seenShell.add(o.material)
    const source = sphere ? new IcosahedronGeometry(1, o.material.name === 'lambert4' ? 1 : 2) : o.geometry
    const g = (source.index ? source.toNonIndexed() : source.clone()).applyMatrix4(new Matrix4().multiplyMatrices(normalise, o.matrixWorld))
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name)
    const list = groups.get(o.material) ?? []
    list.push(g)
    groups.set(o.material, list)
  })
  return [...groups].map(([material, list]) => {
    const geometry = mergeGeometries(list)
    list.forEach((g) => g.dispose())
    return { geometry, material: orbMaterial(material) }
  })
}

export function Orbs({ sim }) {
  const { scene } = useAsset('orb')
  const { group, meshes } = useMemo(() => {
    const group = new Object3D()
    const meshes = orbParts(scene).map(({ geometry, material }) => {
      const m = new InstancedMesh(geometry, material, ORBS.pool)
      m.frustumCulled = false
      m.count = 0
      group.add(m)
      return m
    })
    return { group, meshes }
  }, [scene])
  const tmp = useMemo(() => new Object3D(), [])
  useEffect(() => () => meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose() }), [meshes])

  useFrame(({ clock }) => {
    const s = sim.current
    const t = clock.elapsedTime
    let n = 0
    for (const o of s.orbs) {
      const ahead = o.dist - s.dist
      if (!o.active || ahead > ORBS.drawAhead || ahead < -1.2) continue // beyond ~55 m an orb is a few pixels; once past Aisha it would loom beside the camera (which sits 5.6 m behind her)
      const pop = o.taken ? o.takenT / ORBS.popTime : 0
      tmp.position.set(o.x, o.y + Math.sin(t * 2.4 + o.id) * 0.06 + pop * 0.9, -(o.dist - s.dist))
      tmp.rotation.set(0, t * 1.6 + o.id, 0)
      tmp.scale.setScalar(o.taken ? Math.max(0.001, (1 - pop) * 1.25) : 1)
      tmp.updateMatrix()
      for (const m of meshes) m.setMatrixAt(n, tmp.matrix)
      n++
    }
    for (const m of meshes) { m.count = n; m.instanceMatrix.needsUpdate = true }
  })
  return <primitive object={group} />
}

