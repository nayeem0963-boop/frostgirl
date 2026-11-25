// Third-person runner camera: behind and above Aisha, pulled back on narrow
// (portrait) screens so all three lanes stay in view. Pure maths.
import { LANES, LANE_WIDTH } from '../config.js'

const HALF_VIEW = LANES[2] + LANE_WIDTH * 0.5 + 0.9 // outer lane edge + margin at the runner's depth

/** Camera offset for a viewport aspect ratio (width / height). */
export function cameraFor(aspect) {
  const fov = aspect < 0.8 ? 70 : aspect < 1.2 ? 64 : 58
  const tanH = Math.tan((fov * Math.PI) / 360) * aspect // tan(half horizontal fov)
  const back = Math.min(13, Math.max(5.8, HALF_VIEW / tanH))
  return { fov, back, height: 2.75 + (back - 5.8) * 0.38, lookAhead: 10, lookHeight: 0.7 }
}

/** Smoothed camera target for a sim state. Vertical follow is damped so jumps stay calm. */
export function cameraTarget(rig, sim, out = {}) {
  out.px = sim.x * 0.55
  out.py = rig.height + sim.y * 0.25
  out.pz = rig.back
  out.lx = sim.x * 0.35
  out.ly = rig.lookHeight + sim.y * 0.2
  out.lz = -rig.lookAhead
  return out
}
