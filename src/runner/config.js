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
  hole: { halfW: 0.9, halfD: 0.8, y0: -10, y1: 0.25 }, // World 04: a hole in the ice, one lane wide, 1.6 m long: hits a runner whose feet are below 0.25 m, so a jump clears it (or switch lanes)
  shard: { halfW: 0.75, halfD: 0.5, y0: 0, y1: 2.0 }, // World 03: a fallen crystal spire, one lane, 2 m high (above a jump's 1.7 m apex): switch lanes
  wolf: { halfW: 0.5, halfD: 0.6, y0: 0, y1: 1.0 }, // World 02: one lane, 1 m high: switch lanes or jump it (wolf.glb is scaled to 0.8 = 1.3 m)
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

// World 02's wolf waits at the edge of the trail, then lunges into its lane. The collider follows the visible wolf, and the
// lunge is finished lungeTo metres before Aisha: 14 m = 1.12 s of reaction time even at top speed (patterns.js REACTION + shifts).
export const WOLF = {
  sideX: 5.6, // where it waits: just outside the trail
  lungeFrom: 26, // metres ahead when it starts to run
  lungeTo: 14, // ... and is in its lane
  scale: 0.8, // 1.3 m tall, 1.5 m long (the collider is a little smaller: 1.0 m high, 1.2 m long)
}

// World 03's crystal shard: a glowing marker shows its lane from far away, the spire falls while it is dropFrom..landAt metres
// ahead of Aisha and has landed landAt metres before her (16 m = 1.28 s at top speed: more than the generator's worst case,
// patterns.js REACTION + 2 shifts). Its collider is static: nothing can touch it while it is still falling, it is 16+ m away.
export const SHARD = { dropFrom: 34, landAt: 16, height: 18 }

// World 04's cracking ice: a lane shows cracks from far away, breaks open into water between breakFrom and breakTo metres ahead of
// Aisha (24 -> 20 m: 1.6 s of reaction even at top speed), and then it is a hole she must dodge or jump.
export const HOLE = { breakFrom: 24, breakTo: 20 }
