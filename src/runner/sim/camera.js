// Third-person runner camera: behind and above Aisha, looking down the trail.
// Pure maths. Distance and field of view adapt to the viewport so that
//  - Aisha stays on screen in every lane (the camera follows her sideways at 55%), and
//  - the outer lane edges are fully visible 14 m ahead (so a hazard in the far lane is seen in time),
// without pulling back more than necessary: Aisha stays prominent.
import { LANES, LANE_WIDTH } from '../config.js'

const FOLLOW_X = 0.55
const NEED_PLAYER = (LANES[2] * (1 - FOLLOW_X)) + 0.6 // half width needed at her depth: farthest lane offset + margin
const NEED_AHEAD = LANES[2] + LANE_WIDTH / 2 + LANES[2] * FOLLOW_X // outer edge to the camera axis at the far lane
const AHEAD = 14

/** Camera rig for a viewport aspect ratio (width / height). */
export function cameraFor(aspect) {
  const fov = aspect < 0.8 ? 66 : aspect < 1.2 ? 62 : 56
  const tanH = Math.tan((fov * Math.PI) / 360) * aspect // tan(half horizontal fov)
  const back = Math.min(8.6, Math.max(5.6, NEED_PLAYER / tanH, NEED_AHEAD / tanH - AHEAD))
  return { fov, back, height: 2.7 + (back - 5.6) * 0.3, lookAhead: 9, lookHeight: 0.6 }
}

/** Camera target for a sim state. Vertical follow is strongly damped so jumps stay calm. */
export function cameraTarget(rig, sim, out = {}) {
  out.px = sim.x * FOLLOW_X
  out.py = rig.height + sim.y * 0.3
  out.pz = rig.back
  out.lx = sim.x * 0.4
  out.ly = rig.lookHeight + sim.y * 0.25
  out.lz = -rig.lookAhead
  return out
}
