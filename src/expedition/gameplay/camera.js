// Third-person follow camera: orbit (yaw/pitch), smooth follow, terrain and
// obstacle collision, gentle auto-recentre behind the hiker.
import { clamp } from '../core/noise.js'

export function createCameraRig(player, distance = 5.2) {
  return {
    yaw: player.yaw + Math.PI, // camera behind the player
    pitch: 0.32,
    distance,
    baseDistance: distance,
    current: distance,
    tx: player.x, ty: player.y + 1.45, tz: player.z,
    x: 0, y: 0, z: 0,
    idle: 0,
  }
}

const PITCH_MIN = -0.35
const PITCH_MAX = 1.15

/**
 * look: [dx, dy] pixel deltas; sensitivity in rad/pixel.
 * manualRecent: true while the user is actively steering the camera.
 */
export function stepCamera(rig, player, look, dt, world, { sensitivity = 0.0034, manualRecent = false } = {}) {
  rig.yaw -= look[0] * sensitivity
  rig.pitch = clamp(rig.pitch + look[1] * sensitivity, PITCH_MIN, PITCH_MAX)

  // Auto-recentre behind the direction of travel when the player isn't steering.
  if (!manualRecent && player.speed > 1.2 && player.grounded) {
    const behind = Math.atan2(player.vx, player.vz) + Math.PI
    let d = behind - rig.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    // Only recentre gently and never whip around when walking toward camera.
    if (Math.abs(d) < 2.2) rig.yaw += d * (1 - Math.exp(-0.9 * dt))
  }

  // Smoothed follow target (slight lag vertically to absorb steps/jumps).
  const kH = 1 - Math.exp(-14 * dt)
  const kV = 1 - Math.exp(-(player.grounded ? 9 : 4) * dt)
  rig.tx += (player.x - rig.tx) * kH
  rig.tz += (player.z - rig.tz) * kH
  rig.ty += (player.y + 1.45 - rig.ty) * kV

  const cp = Math.cos(rig.pitch)
  const dx = Math.sin(rig.yaw) * cp
  const dy = Math.sin(rig.pitch)
  const dz = Math.cos(rig.yaw) * cp

  // Collision: march along the boom, stop before terrain or tall obstacles.
  let allowed = rig.distance
  const stepLen = 0.25
  for (let t = 0.4; t <= rig.distance; t += stepLen) {
    const px = rig.tx + dx * t
    const py = rig.ty + dy * t
    const pz = rig.tz + dz * t
    if (world.height(px, pz) + 0.35 > py) { allowed = Math.max(0.6, t - stepLen); break }
    const cs = world.colliders(px, pz)
    let hit = false
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i]
      if (c.top < py - 0.2) continue
      let r = c.radius + 0.2
      if (c.size) {
        // Spruce foliage: a cone ~2 m * size wide at the base, narrowing to the tip.
        const h = (py - c.base) / (10 * c.size)
        if (h > 0.08 && h < 1) r = Math.max(r, c.size * 2.1 * (1 - h) * 0.75)
      }
      if ((px - c.x) ** 2 + (pz - c.z) ** 2 < r * r) { hit = true; break }
    }
    if (hit) { allowed = Math.max(0.8, t - stepLen); break }
  }
  // Pull in fast, ease back out slowly: no snapping or jitter.
  const k = allowed < rig.current ? 1 - Math.exp(-18 * dt) : 1 - Math.exp(-2.5 * dt)
  rig.current += (allowed - rig.current) * k

  rig.x = rig.tx + dx * rig.current
  rig.y = rig.ty + dy * rig.current
  rig.z = rig.tz + dz * rig.current
  const floor = world.height(rig.x, rig.z) + 0.4
  if (rig.y < floor) rig.y = floor
  return rig
}
