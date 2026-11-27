// Alpine forest built from the Meshy spruce scan (alpine-spruces.glb: eight
// spruces cut from the scan, each in four LODs, one shared material).
//
// Trail-side forest: per variant, one InstancedMesh per LOD (0-2). A cheap
// per-tree distance test (throttled, not every frame) assigns each tree to a
// LOD. Far trees on the valley walls: static instanced LOD3.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, Group, InstancedMesh, Object3D, Vector3 } from 'three'
import { useAsset } from '../../assets/index.js'
import { SPRUCE_VARIANTS } from '../world/world.js'

// Switch distances in metres: [close detail, near].
const LOD_RANGES = { high: [18, 55], low: [12, 40] }

function spruceGeometries(scene) {
  const out = []
  scene.traverse((o) => {
    const m = o.isMesh && o.name.match(/spruce(\d+)_lod(\d)/)
    if (m) {
      out[m[1]] ??= []
      out[m[1]][m[2]] = o.geometry
    }
  })
  return out
}

function treeMatrix(dummy, t, sink) {
  dummy.position.set(t.x, t.y - sink, t.z)
  dummy.rotation.set(t.lean ?? 0, t.r, (t.lean ?? 0) * 0.6)
  dummy.scale.setScalar(t.h)
  dummy.updateMatrix()
  return dummy.matrix.clone()
}

export function Forest({ world, quality }) {
  const { scene } = useAsset('spruces')
  const [r0, r1] = LOD_RANGES[quality] ?? LOD_RANGES.high
  const state = useRef({ x: Infinity, z: Infinity, fx: 0, fz: 0, t: 0 })

  const forest = useMemo(() => {
    const geos = spruceGeometries(scene)
    let material = null
    scene.traverse((o) => { if (o.isMesh && !material) material = o.material })
    material = material.clone()
    material.side = DoubleSide // thin scanned needles: render both faces
    material.roughness = 0.95
    material.metalness = 0
    material.envMapIntensity = 0.55
    material.color.setScalar(1.18) // the baked scan texture is quite dark

    const group = new Group()
    const dummy = new Object3D()
    const variants = Math.min(SPRUCE_VARIANTS, geos.length)

    // Near/mid forest: dynamic LOD split.
    const byVariant = Array.from({ length: variants }, () => [])
    for (const t of world.scatter.trees) {
      byVariant[t.v % variants].push({ x: t.x, z: t.z, h: t.h, m: treeMatrix(dummy, t, 0.25 + t.h * 0.015) })
    }
    const near = byVariant.map((list, v) => {
      const lods = [0, 1, 2].map((l) => {
        const m = new InstancedMesh(geos[v][l], material, Math.max(1, list.length))
        m.frustumCulled = false // instances are culled in the LOD pass below
        m.count = 0
        m.receiveShadow = true
        // Only the close LOD casts: its range sits inside the sun's ~40 m
        // shadow frustum, and the shadow pass then stays cheap.
        m.castShadow = l === 0 && quality !== 'low'
        group.add(m)
        return m
      })
      return { list, lods }
    })

    // Far forest: static LOD3, grouped into angular sectors around the valley
    // so off-screen sectors are frustum-culled. Two variants keep calls low.
    const SECTORS = 8
    const farGroups = new Map()
    for (const t of world.scatter.farTrees) {
      const sector = Math.floor(((Math.atan2(t.z, t.x) + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS
      const v = t.v % 2 ? 4 : 0 // one mature + one young silhouette
      const key = `${sector}:${v}`
      if (!farGroups.has(key)) farGroups.set(key, { v, list: [] })
      farGroups.get(key).list.push(t)
    }
    for (const { v, list } of farGroups.values()) {
      const far = new InstancedMesh(geos[v][3], material, list.length)
      list.forEach((t, i) => far.setMatrixAt(i, treeMatrix(dummy, t, 0.6)))
      far.computeBoundingSphere()
      group.add(far)
    }
    return { group, near }
  }, [scene, world, quality])

  // Re-split LODs when the camera moves or turns enough (not every frame).
  const fwd = useMemo(() => new Vector3(), [])
  useFrame(({ camera }, dt) => {
    const s = state.current
    s.t += dt
    camera.getWorldDirection(fwd)
    const cx = camera.position.x
    const cz = camera.position.z
    const moved = (cx - s.x) ** 2 + (cz - s.z) ** 2 > 2.25 || fwd.x * s.fx + fwd.z * s.fz < 0.995
    if (!moved && s.t < 0.5) return
    s.x = cx; s.z = cz; s.fx = fwd.x; s.fz = fwd.z; s.t = 0
    const a2 = r0 * r0
    const b2 = r1 * r1
    for (const { list, lods } of forest.near) {
      const n = [0, 0, 0]
      for (const t of list) {
        const dx = t.x - cx
        const dz = t.z - cz
        const d2 = dx * dx + dz * dz
        // Skip trees well behind the camera (keep nearby ones for shadows).
        if (d2 > 1600 && dx * fwd.x + dz * fwd.z < -(t.h * 0.6 + 10)) continue
        const l = d2 < a2 ? 0 : d2 < b2 ? 1 : 2
        lods[l].setMatrixAt(n[l]++, t.m)
      }
      for (let l = 0; l < 3; l++) {
        lods[l].count = n[l]
        lods[l].instanceMatrix.needsUpdate = true
      }
    }
  })

  return <primitive object={forest.group} />
}

