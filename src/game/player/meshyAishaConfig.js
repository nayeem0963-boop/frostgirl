// Pure data and rules for the Meshy Aisha avatar of the original game (see MeshyAisha.jsx).
export const MESHY_AISHA = {
  scale: 0.95, // metres of the rig -> this game's units (her head top is 1.7 m at scale 1)
  rotationY: Math.PI, // the rig faces +z; the track runs toward -z
  strideSpeed: 4, // ground speed of the run clip at 1x (measured from the rig, see docs/FROST.md)
  minRate: 1,
  maxRate: 2.5,
}

// clip names inside aisha.glb; range = sub-range in seconds (the jump export holds the airborne and crouch poses)
export const MESHY_STATES = {
  idle: { clip: 'idle', loop: true, fade: 0.25 },
  run: { clip: 'run', loop: true, fade: 0.14 },
  air: { clip: 'land', loop: false, fade: 0.06, range: [0.54, 1.12], noLift: true },
  duck: { clip: 'land', loop: false, fade: 0.09, range: [0.26, 0.34], noLift: false },
}

/** Which of the clips above the character should show for the movement and run state. */
export function meshyState(movement, run) {
  if (movement.action === 'jumping') return 'air'
  if (movement.action === 'sliding') return 'duck'
  return run.started ? 'run' : 'idle'
}

/** Run-clip playback rate for a ground speed, so the stance foot keeps pace with the track. */
export const meshyRunRate = (speed) => Math.min(MESHY_AISHA.maxRate, Math.max(MESHY_AISHA.minRate, speed / MESHY_AISHA.strideSpeed))
