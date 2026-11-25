// The finish line: a checkered strip across the trail and an ice gate with a FINISH banner. Decoration only; crossing it is
// decided by the sim (sim.dist >= world.finishDistance). Nothing is placed within LEVEL.clearance of it, so the run-in is clear.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BoxGeometry, CanvasTexture, Color, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RUN } from '../config.js'
import { LANES, LANE_WIDTH } from '../config.js'

const EDGE = LANES[2] + LANE_WIDTH / 2 + 0.5 // pillars stand just outside the outer lane rail

function checker(w, h, cols, rows, text) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')
  const cw = w / cols, ch = h / rows
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { g.fillStyle = (x + y) % 2 ? '#12304f' : '#f4fbff'; g.fillRect(x * cw, y * ch, cw, ch) }
  if (text) {
    g.fillStyle = 'rgba(10,40,80,0.82)'; g.fillRect(w * 0.18, h * 0.12, w * 0.64, h * 0.76)
    g.fillStyle = '#ffffff'; g.font = `800 ${h * 0.6}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + h * 0.03)
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4
  return t
}

export function FinishGate({ sim }) {
  const ref = useRef()
  const parts = useMemo(() => {
    const ice = new MeshStandardMaterial({ color: new Color('#6fc3f2'), emissive: new Color('#2a86d6'), emissiveIntensity: 0.6, roughness: 0.25, flatShading: true })
    return {
      ice,
      // two pillars and the top beam as ONE mesh (budget: 3 draw calls for the whole gate: frame, banner, strip)
      frame: mergeGeometries([
        new BoxGeometry(0.9, 4.4, 0.9).translate(-EDGE, 2.2, 0),
        new BoxGeometry(0.9, 4.4, 0.9).translate(EDGE, 2.2, 0),
        new BoxGeometry(EDGE * 2 + 1, 0.35, 0.8).translate(0, 4.5, 0),
      ]),
      banner: new PlaneGeometry(EDGE * 2 - 0.4, 1.15), // faces the runner (+z); the back is never seen
      bannerMat: new MeshBasicMaterial({ map: checker(1024, 150, 24, 3, 'FINISH'), toneMapped: false }),
      line: new PlaneGeometry(LANES[2] * 2 + LANE_WIDTH + 0.4, 1.0).rotateX(-Math.PI / 2),
      lineMat: new MeshBasicMaterial({ map: checker(512, 64, 24, 3), transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    }
  }, [])
  useFrame(() => {
    const s = sim.current
    const ahead = s.world.finishDistance - s.dist
    const g = ref.current
    g.visible = ahead < RUN.spawnAhead + 40 && ahead > -14
    g.position.z = -ahead
  })
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={parts.frame} material={parts.ice} />
      <mesh geometry={parts.banner} material={parts.bannerMat} position={[0, 3.85, 0.44]} />
      <mesh geometry={parts.line} material={parts.lineMat} position={[0, 0.04, 0]} renderOrder={1} />
    </group>
  )
}
