import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color, MeshStandardMaterial, Vector2 } from 'three'
import { createNoise2D, fbm, smoothstep, clamp } from '../core/noise.js'
import { TRAIL_HALF_WIDTH } from '../world/trail.js'
import { LEVEL, streamDistance } from '../world/level.js'
import { getSnowNormalMap } from './textures.js'

const nCol = createNoise2D(97)
const nPatch = createNoise2D(131)

const SNOW_BRIGHT = new Color('#f2f5f9')
const SNOW_COOL = new Color('#cfdbe8')
const SNOW_SHADOW = new Color('#b4c5d9')
const TRAIL_PACKED = new Color('#aaa59c')
const TRAIL_WORN = new Color('#7a6f62')
const ROCK = new Color('#585c63')
const ROCK_DARK = new Color('#3e4148')
const ICE = new Color('#9fc4da')

function buildGeometry(grid) {
  const { xs, zs, nx, nz, h, trailD } = grid
  const count = nx * nz
  const pos = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      pos[k * 3] = xs[i]
      pos[k * 3 + 1] = h[k]
      pos[k * 3 + 2] = zs[j]
      uv[k * 2] = xs[i] / 3.5
      uv[k * 2 + 1] = zs[j] / 3.5
    }
  }
  const index = new Uint32Array((nx - 1) * (nz - 1) * 6)
  let o = 0
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      const b = (j + 1) * nx + i
      const c = (j + 1) * nx + i + 1
      const d = j * nx + i + 1
      index[o++] = a; index[o++] = b; index[o++] = d
      index[o++] = b; index[o++] = c; index[o++] = d
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  g.setIndex(new BufferAttribute(index, 1))
  g.computeVertexNormals()

  // Vertex colours: snow variation, packed trail, exposed rock, ice.
  const nrm = g.attributes.normal.array
  const col = new Float32Array(count * 3)
  const c = new Color()
  const tmp = new Color()
  for (let k = 0; k < count; k++) {
    const x = pos[k * 3]
    const y = pos[k * 3 + 1]
    const z = pos[k * 3 + 2]
    const ny = nrm[k * 3 + 1]
    const d = trailD[k]
    const n = fbm(nCol, x / 22, z / 22, 3)
    const fine = nCol(x / 3.1, z / 3.1)
    // Snow: brighter on sun-facing (south-west) slopes, cooler in hollows.
    const sunFacing = clamp(0.5 + nrm[k * 3] * -0.6 + nrm[k * 3 + 2] * 0.6, 0, 1)
    c.copy(SNOW_COOL).lerp(SNOW_BRIGHT, clamp(0.45 + n * 0.5 + sunFacing * 0.35 + fine * 0.08, 0, 1))
    const hollow = smoothstep(0.98, 0.9, ny) * 0.35
    c.lerp(SNOW_SHADOW, hollow)
    // Trail
    const onTrail = 1 - smoothstep(TRAIL_HALF_WIDTH - 0.7, TRAIL_HALF_WIDTH + 0.9, d + fine * 0.5)
    if (onTrail > 0) {
      const worn = clamp(0.35 + fbm(nPatch, x / 2.4, z / 2.4, 2) * 0.9 - d * 0.22, 0, 1)
      tmp.copy(TRAIL_PACKED).lerp(TRAIL_WORN, worn * 0.7)
      c.lerp(tmp, onTrail * 0.92)
    }
    // Rock on steep faces, with snow lingering in streaks.
    const steep = smoothstep(0.86, 0.66, ny + fine * 0.05)
    if (steep > 0) {
      tmp.copy(ROCK).lerp(ROCK_DARK, clamp(0.5 + n, 0, 1))
      const streak = clamp(0.5 + Math.sin(y * 1.7 + n * 6) * 0.5, 0, 1) * 0.35
      c.lerp(tmp, steep * (1 - streak))
    }
    // Ice in the frozen stream bed
    if (Math.abs(z - LEVEL.stream.z) < 120) {
      const sd = streamDistance(x, z)
      const ice = 1 - smoothstep(LEVEL.stream.halfWidth - 0.3, LEVEL.stream.halfWidth + 0.6, sd)
      if (ice > 0) c.lerp(ICE, ice * 0.85)
    }
    // Distant terrain: subtle blue atmospheric shift on high ridges.
    const alt = smoothstep(120, 700, y)
    c.lerp(SNOW_COOL, alt * 0.25)
    col[k * 3] = c.r
    col[k * 3 + 1] = c.g
    col[k * 3 + 2] = c.b
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.computeBoundingSphere()
  return g
}

export function Terrain({ world }) {
  const geometry = useMemo(() => buildGeometry(world.grid), [world])
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      normalMap: getSnowNormalMap(),
      normalScale: new Vector2(0.45, 0.45),
      envMapIntensity: 0.6,
    })
    return m
  }, [])
  return <mesh geometry={geometry} material={material} receiveShadow />
}
