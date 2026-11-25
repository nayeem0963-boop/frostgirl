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

// Orbs of Chi (public/assets/collectibles/orb_of_chi.glb): collectibles along the trail.
export const ORBS = {
  radius: 0.4, // collision radius (the mesh is scaled to match)
  groundY: 0.9, // lines at chest height: collected just by running through them
  arcY: 2.35, // jump arcs over a fallen pine: only a jumping Aisha reaches them (standing head top is 1.7 m)
  spacing: 2.2,
  pool: 48,
  chance: 0.85, // probability that a gap between two obstacle rows gets a line
  popTime: 0.25, // collected orbs shrink away over this long
  spawnAhead: 75,
  drawAhead: 55, // orbs further than this are not drawn (mobile triangle budget)
}

// Levels (4.3): a world's finish distance lives in src/worlds/runnerThemes.js.
export const LEVEL = {
  clearance: 25, // no obstacle or orb is placed within this many metres of the finish line: a clean run-in
  stopDecel: 9, // m/s^2 while Aisha coasts to a stop after the line
  twoStars: 0.5, // share of the level's orbs collected for 2 stars
  threeStars: 0.75, // ... for 3 stars (finishing alone is 1 star)
}
