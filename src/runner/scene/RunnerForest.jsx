// Decorative pines beside the trail, built from the Meshy spruce scan
// (alpine-spruces.glb). They are scenery only: placement keeps every trunk and
// crown clear of the lanes (scenery.js), so they never block the runner or the
// camera. Instanced per variant and LOD; slots recycle as the run advances.
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { DoubleSide, Group, InstancedMesh, Matrix4, Object3D } from 'three'
import { ASSETS } from '../../expedition/assets.js'
import { SLOTS_PER_SIDE, VARIANTS, groundY, slotAhead, treeAt } from './scenery.js'

const LOD_NEAR = 38 // metres ahead of the camera: LOD0 (~8k tris) / LOD1 (~1.5k) / LOD2 (~200)
const LOD_MID = 95

export function RunnerForest({ sim }) {
  const { scene } = useGLTF(ASSETS.spruces)

  const forest = useMemo(() => {
    // Bake each node's quantisation transform into the geometry (unit tree: base at y=0, ~1 high).
    const geos = {}
    scene.updateMatrixWorld(true)
    let material = null
    scene.traverse((o) => {
      const m = o.isMesh && o.name.match(/spruce(\d+)_lod(\d)/)
      if (!m) return
      material ??= o.material
      geos[`${m[1]}:${m[2]}`] = o.geometry.clone().applyMatrix4(o.matrixWorld)
    })
    material = material.clone()
    material.side = DoubleSide
    material.roughness = 0.95
    material.metalness = 0
    material.envMapIntensity = 0.55
    material.color.setScalar(1.18) // the baked scan is dark

    const group = new Group()
    group.name = 'forest'
    const meshes = {}
    const total = SLOTS_PER_SIDE * 2
    for (const v of VARIANTS) {
      for (let l = 0; l < 3; l++) {
        const m = new InstancedMesh(geos[`${v}:${l}`], material, total)
        m.frustumCulled = false
        m.count = 0
        group.add(m)
        meshes[`${v}:${l}`] = m
      }
    }
    const slots = Array.from({ length: total }, (_, i) => ({ i, lap: Number.NaN, tree: null, base: treeAt(i, 0).base }))
    return { group, meshes, slots, counts: {} }
  }, [scene])

  const tmp = useMemo(() => new Object3D(), [])
  const mat = useMemo(() => new Matrix4(), [])

  useFrame(() => {
    const { meshes, slots, counts } = forest
    for (const k in meshes) counts[k] = 0
    const dist = sim.current.dist
    for (const s of slots) {
      const { ahead, lap } = slotAhead(s.base, dist)
      if (lap !== s.lap) { s.lap = lap; s.tree = treeAt(s.i, lap) }
      const t = s.tree
      const l = ahead < LOD_NEAR ? 0 : ahead < LOD_MID ? 1 : 2
      const key = `${t.v}:${l}`
      const mesh = meshes[key]
      tmp.position.set(t.x, groundY(t.x) - 0.15, -ahead)
      tmp.rotation.set(t.lean, t.rot, t.lean * 0.6)
      tmp.scale.setScalar(t.h)
      tmp.updateMatrix()
      mesh.setMatrixAt(counts[key]++, tmp.matrix)
    }
    for (const k in meshes) {
      meshes[k].count = counts[k]
      meshes[k].instanceMatrix.needsUpdate = true
    }
    void mat
  })

  return <primitive object={forest.group} />
}

useGLTF.preload(ASSETS.spruces)
