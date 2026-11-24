// Tuning for the Frost runner. Distances in metres, times in seconds.
// The runner stays at z = 0; the world scrolls toward +z (see sim/sim.js).
export const LANES = [-2.2, 0, 2.2]
export const LANE_WIDTH = 2.2
export const TRAIL_HALF_WIDTH = 3.5 // packed-snow running surface, beyond the outer lane edge (3.3)

export const RUN = {
  // Ground speed is matched to Aisha's run clip (see ANIM): her stance foot moves at ~4 m/s at 1x playback.
  startSpeed: 7.5,
  maxSpeed: 12.5,
  accel: 0.042, // m/s per second: full speed after ~2 minutes
  safeSeconds: 3.5, // nothing spawns closer than this many seconds of running
  spawnAhead: 80, // obstacles appear this far ahead (visible through the fog)
  despawnBehind: 12,
}

export const PLAYER = {
  laneTime: 0.14, // seconds to glide one lane (ease-out: quick start, no overshoot)
  queueTime: 0.2, // a lane press made mid-glide is remembered this long
  gravityUp: 38,
  gravityDown: 46, // slightly heavier on the way down: a crisp arc, no floating
  jumpVelocity: 11.4, // apex 1.71 m, air time ~0.57 s
  jumpBuffer: 0.12, // a jump pressed this long before landing fires on touch-down
  duckTime: 0.7,
  halfWidth: 0.32,
  halfDepth: 0.28,
  standHeight: 1.7,
  duckHeight: 1.2, // crouch pose measured at 1.18 m (head top) in aisha.glb
  fastFall: -22, // Down while airborne
  landTime: 0.2,
}

export const OBSTACLES = {
  // Colliders are independent of the meshes: box = centre x/z, half extents, y range.
  wall: { halfW: 0.95, halfD: 0.45, y0: 0, y1: 2.4 }, // one lane, full height: switch lanes
  ridge: { halfW: LANE_WIDTH * 1.5, halfD: 0.4, y0: 0, y1: 0.8 }, // all lanes, low: jump
  arch: { halfW: LANE_WIDTH * 1.5, halfD: 0.4, y0: 1.4, y1: 2.8 }, // all lanes, overhead: duck (head top ducked 1.2 m)
}

// Run animation: playback rate follows ground speed so her feet do not slide.
export const ANIM = {
  strideSpeed: 4.0, // m/s of ground covered by the run clip's stance foot at 1x (measured from the rig)
  minRate: 1.0,
  maxRate: 2.5, // beyond this the cadence looks frantic; a small slip is accepted instead
}
