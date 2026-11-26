// World 06's aurora gusts (the push itself is decided by the sim, sim/gust.js): a teal chevron line across the trail marks where the
// next gust will shove Aisha (visible from far away), and wind streaks fly across the screen in the gust's direction as she
// approaches the line and for a moment after she crosses it. Two instanced meshes: the chevron lines and the streaks.
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BoxGeometry, CanvasTexture, DoubleSide, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, SRGBColorSpace } from 'three'
import { GUST } from '../config.js'
import { gustAt, nextGustIndex } from '../sim/gust.js'

const STREAKS = 44
const WARN_STREAKS = 70 // streaks start this many metres before the line, and thicken
const AFTER = 22 // ... and last this many metres after it

function chevronTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(8,120,130,0.62)'; g.fillRect(0, 10, 512, 108) // a deep teal band: it must stand out against pale snow
  g.lineCap = 'round'; g.lineJoin = 'round'
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 80
    g.beginPath(); g.moveTo(x, 22); g.lineTo(x + 34, 64); g.lineTo(x, 106)
    g.strokeStyle = 'rgba(4,60,80,1)'; g.lineWidth = 20; g.stroke()
    g.strokeStyle = 'rgba(235,255,250,1)'; g.lineWidth = 9; g.stroke()
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace
  return t
}

const rnd = (i, salt) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x) }

export function Gusts({ sim, gust }) {
  const { lines, streaks } = useMemo(() => {
    const flat = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const lines = new InstancedMesh(flat, new MeshBasicMaterial({ map: chevronTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: DoubleSide }), 2)
    lines.frustumCulled = false; lines.count = 0; lines.renderOrder = 1
    const streaks = new InstancedMesh(new BoxGeometry(2.4, 0.03, 0.03), new MeshBasicMaterial({ color: '#9affde', transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }), STREAKS)
    streaks.frustumCulled = false; streaks.count = 0
    return { lines, streaks }
  }, [])
  const tmp = useMemo(() => new Object3D(), [])

  useFrame(({ clock }) => {
    const s = sim.current
    const k = nextGustIndex(s.dist, gust)
    // chevron lines: the next two gusts that are within sight
    let n = 0
    for (let j = k; j < k + 2; j++) {
      const { at, dir } = gustAt(j, gust)
      const ahead = at - s.dist
      if (ahead > GUST.warn || ahead < -3) continue
      tmp.position.set(0, 0.045, -ahead)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(8.4 * dir, 1, 14) // a negative x scale mirrors the chevrons for a gust to the left. Deep (14 m): the chase camera is low, so a shallow decal collapses into a thin line
      tmp.updateMatrix()
      lines.setMatrixAt(n++, tmp.matrix)
    }
    lines.count = n; lines.instanceMatrix.needsUpdate = true

    // streaks: strongest right at the line, building up before it and fading after it
    const next = gustAt(k, gust)
    const prev = k > 0 ? gustAt(k - 1, gust) : null
    const before = Math.max(0, 1 - (next.at - s.dist) / WARN_STREAKS)
    const after = prev ? Math.max(0, 1 - (s.dist - prev.at) / AFTER) : 0
    const intensity = Math.max(before * before, after)
    const dir = after > before * before ? prev.dir : next.dir
    const count = Math.floor(STREAKS * intensity)
    const t = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const u = (((t * 34 * dir + rnd(i, 1) * 44) % 44) + 44) % 44 - 22 // sweeps across, wraps around
      tmp.position.set(s.x * 0.55 + u, 0.35 + rnd(i, 2) * 3.6, 3 - rnd(i, 3) * 20)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(0.6 + rnd(i, 4) * 0.9, 1, 1)
      tmp.updateMatrix()
      streaks.setMatrixAt(i, tmp.matrix)
    }
    streaks.count = count; streaks.instanceMatrix.needsUpdate = true
  })

  return <><primitive object={lines} /><primitive object={streaks} /></>
}
