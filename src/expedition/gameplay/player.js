// Third-person hiking controller (pure logic, no rendering).
import { clamp } from '../core/noise.js'

export const PLAYER = {
  radius: 0.32,
  walkSpeed: 2.7,
  sprintSpeed: 5.8,
  deepSnowFactor: 0.62,
  groundAccel: 16,
  iceAccel: 2.0,
  airAccel: 3.5,
  jumpVelocity: 6.3,
  gravity: 20,
  stepHeight: 0.38,
  snapDown: 0.55,
  maxWalkableNormalY: 0.74, // ~42 degrees
  jumpCost: 8,
  sprintDrain: 15,
  staminaRegen: 12,
  safeFallHeight: 4.5,
  fatalDrop: 7,
}

export function createPlayer(start) {
  return {
    x: start.x, y: start.y, z: start.z,
    vx: 0, vy: 0, vz: 0,
    yaw: Math.atan2(start.tx ?? 0, start.tz ?? -1),
    grounded: true,
    airTime: 0,
    peakY: start.y,
    landTimer: 0,
    stamina: 100,
    exhausted: false,
    regenDelay: 0,
    health: 100,
    speed: 0,
    sprinting: false,
    onIce: false,
    lastSafeY: start.y,
    lastSafe: { x: start.x, y: start.y, z: start.z },
    anim: 'idle',
    hurtTimer: 0,
    events: [],
  }
}

const surf = {}
const nrm = { x: 0, y: 1, z: 0 }

/**
 * Advance the player one step.
 * input: { mx, my, sprint, jump, camYaw }
 * world: { height(x,z), normal(x,z,out), surface(x,z,out), colliders(x,z) => array }
 */
export function stepPlayer(p, input, dt, world) {
  p.events.length = 0
  const P = PLAYER
  // --- desired movement in camera space
  const fx = -Math.sin(input.camYaw)
  const fz = -Math.cos(input.camYaw)
  const rx = Math.cos(input.camYaw)
  const rz = -Math.sin(input.camYaw)
  let mx = rx * input.mx + fx * input.my
  let mz = rz * input.mx + fz * input.my
  const mag = Math.min(1, Math.hypot(mx, mz))
  if (mag > 1e-3) { const l = Math.hypot(mx, mz); mx /= l; mz /= l }

  world.surface(p.x, p.z, surf)
  p.onIce = surf.ice > 0 && p.grounded

  // --- stamina / sprint
  const wantsSprint = input.sprint && mag > 0.2 && !p.exhausted
  p.sprinting = wantsSprint && p.grounded ? true : (wantsSprint && p.sprinting)
  if (p.sprinting && p.grounded) {
    p.stamina -= P.sprintDrain * dt
    p.regenDelay = 0.8
    if (p.stamina <= 0) { p.stamina = 0; p.exhausted = true; p.sprinting = false; p.events.push('exhausted') }
  } else if (p.regenDelay > 0) {
    p.regenDelay -= dt
  } else {
    p.stamina = Math.min(100, p.stamina + P.staminaRegen * dt)
  }
  if (p.exhausted && p.stamina > 30) p.exhausted = false

  // --- target horizontal velocity
  let speed = (p.sprinting ? P.sprintSpeed : P.walkSpeed) * mag
  if (!surf.onTrail && surf.d > 3.2 && p.grounded) speed *= P.deepSnowFactor
  world.normal(p.x, p.z, nrm)
  // uphill drag: slope along movement direction
  const grade = -(nrm.x * mx + nrm.z * mz) / Math.max(nrm.y, 0.2)
  if (grade > 0) speed *= clamp(1 - grade * 0.9, 0.4, 1)
  const tvx = mx * speed
  const tvz = mz * speed

  const accel = !p.grounded ? P.airAccel : p.onIce ? P.iceAccel : P.groundAccel
  const k = 1 - Math.exp(-accel * dt)
  p.vx += (tvx - p.vx) * k
  p.vz += (tvz - p.vz) * k
  if (p.onIce) {
    p.vx += surf.driftX * dt
    p.vz += surf.driftZ * dt
    // ice is downhill-slippery too
    p.vx += nrm.x * 6 * dt
    p.vz += nrm.z * 6 * dt
  }

  // Steep terrain: you slide off it rather than climbing it.
  if (p.grounded && nrm.y < P.maxWalkableNormalY) {
    const push = (P.maxWalkableNormalY - nrm.y) * 40
    p.vx += nrm.x * push * dt
    p.vz += nrm.z * push * dt
    const into = p.vx * nrm.x + p.vz * nrm.z
    if (into < 0) { p.vx -= nrm.x * into; p.vz -= nrm.z * into }
  }

  // --- jump
  if (input.jump && p.grounded && p.stamina >= P.jumpCost * 0.5) {
    p.vy = P.jumpVelocity
    p.grounded = false
    p.airTime = 0
    p.peakY = p.y
    p.stamina = Math.max(0, p.stamina - P.jumpCost)
    p.regenDelay = 0.5
    p.events.push('jump')
  }

  // --- integrate horizontal and resolve colliders
  let nx = p.x + p.vx * dt
  let nz = p.z + p.vz * dt
  let platform = -Infinity
  const nearby = world.colliders(nx, nz)
  for (let i = 0; i < nearby.length; i++) {
    const c = nearby[i]
    const dx = nx - c.x
    const dz = nz - c.z
    const dist = Math.hypot(dx, dz)
    const reach = c.radius + P.radius
    if (dist >= reach) continue
    if (p.y >= c.top - P.stepHeight) {
      if (dist < c.radius * 0.9) platform = Math.max(platform, c.top)
      continue
    }
    const n = dist > 1e-4 ? 1 / dist : 0
    nx = c.x + dx * n * reach
    nz = c.z + dz * n * reach
    const vn = p.vx * dx * n + p.vz * dz * n
    if (vn < 0) { p.vx -= dx * n * vn; p.vz -= dz * n * vn }
  }
  p.x = nx
  p.z = nz

  // --- vertical
  const ground = Math.max(world.height(p.x, p.z), platform)
  if (p.grounded) {
    if (ground < p.y - P.snapDown) {
      p.grounded = false
      p.vy = 0
      p.airTime = 0
      p.peakY = p.y
    } else {
      p.y = ground
      p.vy = 0
    }
  }
  if (!p.grounded) {
    p.vy -= P.gravity * dt
    p.y += p.vy * dt
    p.airTime += dt
    if (p.y > p.peakY) p.peakY = p.y
    if (p.y <= ground) {
      const drop = p.peakY - ground
      p.y = ground
      p.vy = 0
      p.grounded = true
      p.landTimer = drop > 1.2 ? 0.42 : 0.22
      p.events.push('land')
      if (drop > P.safeFallHeight) {
        p.health -= (drop - P.safeFallHeight) * 14
        p.hurtTimer = 0.6
        p.events.push('hurt')
      }
    }
  }

  // Track the last safe footing on the trail for the ravine check.
  if (p.grounded && surf.onTrail) {
    p.lastSafeY = p.y
    p.lastSafe.x = p.x; p.lastSafe.y = p.y; p.lastSafe.z = p.z
  }
  if (p.y < p.lastSafeY - P.fatalDrop) p.events.push('fell')

  if (p.landTimer > 0) p.landTimer -= dt
  if (p.hurtTimer > 0) p.hurtTimer -= dt

  // --- facing
  p.speed = Math.hypot(p.vx, p.vz)
  const faceX = p.onIce && mag > 0.1 ? mx : p.vx
  const faceZ = p.onIce && mag > 0.1 ? mz : p.vz
  if (Math.hypot(faceX, faceZ) > 0.25 && (mag > 0.1 || p.speed > 0.6)) {
    const target = Math.atan2(faceX, faceZ)
    let d = target - p.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    p.yaw += d * (1 - Math.exp(-(p.grounded ? 11 : 4) * dt))
  }

  // --- animation intent
  if (!p.grounded) {
    p.anim = p.vy > 0.5 || p.airTime < 0.25 ? 'jump' : 'fall'
  } else if (p.landTimer > 0) {
    p.anim = 'land'
  } else if (p.onIce && p.speed > 2.2 && mag < 0.3) {
    p.anim = 'slide'
  } else if (p.speed < 0.25) {
    p.anim = 'idle'
  } else if (p.sprinting && p.speed > 3.6) {
    p.anim = 'sprint'
  } else {
    p.anim = 'walk'
  }
  return p
}
