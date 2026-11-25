// Tuning for the Frost runner. Distances in metres, times in seconds.
// The runner stays at z = 0; the world scrolls toward +z (see sim/sim.js).
export const LANES = [-2.2, 0, 2.2]
export const LANE_WIDTH = 2.2
export const TRAIL_HALF_WIDTH = 3.5 // packed-snow running surface, beyond the outer lane edge (3.3)

export const RUN = {
  startSpeed: 11,
  maxSpeed: 22,
  accel: 0.12, // m/s per second
  safeSeconds: 3, // no obstacle spawns inside this window
  spawnAhead: 95, // obstacles appear this far ahead (visible through the fog)
  despawnBehind: 12,
}

export const PLAYER = {
  laneTime: 0.16, // seconds to glide one lane
  gravity: 38,
  jumpVelocity: 11.4, // apex 1.71 m, air time ~0.6 s
  duckTime: 0.7,
  halfWidth: 0.32,
  halfDepth: 0.28,
  standHeight: 1.7,
  duckHeight: 0.8,
  fastFall: -22, // Down while airborne
}

export const OBSTACLES = {
  // Colliders are independent of the meshes: box = centre x/z, half extents, y range.
  wall: { halfW: 0.95, halfD: 0.45, y0: 0, y1: 2.4 }, // one lane, full height: switch lanes
  ridge: { halfW: LANE_WIDTH * 1.5, halfD: 0.4, y0: 0, y1: 0.8 }, // all lanes, low: jump
  arch: { halfW: LANE_WIDTH * 1.5, halfD: 0.4, y0: 1.05, y1: 2.6 }, // all lanes, overhead: duck
}
