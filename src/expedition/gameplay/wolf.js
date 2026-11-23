// Alpine wolf encounter: patrol -> notice -> warn -> (charge) -> retreat.
// The wolf always warns before it attacks and never leaves its territory far.

export const WOLF = {
  walkSpeed: 1.25,
  stalkSpeed: 0.45,
  chargeSpeed: 7.2,
  noticeRadius: 26,
  warnRadius: 14,
  closeRadius: 6.5,
  calmRadius: 19,
  warnPatience: 3.2,
  biteRange: 1.4,
  biteDamage: 30,
  leash: 34,
  cooldown: 9,
}

export function createWolf(territory) {
  const waypoints = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.sin(i * 2.3) * 0.4
    const r = territory.radius * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)))
    waypoints.push([territory.x + Math.cos(a) * r, territory.z + Math.sin(a) * r])
  }
  return {
    x: waypoints[0][0], z: waypoints[0][1], y: 0,
    yaw: 0,
    mode: 'patrol',
    timer: 0,
    warnTime: 0,
    cooldown: 0,
    wp: 1,
    speed: 0,
    home: { x: territory.x, z: territory.z },
    waypoints,
    pause: 0,
    events: [],
  }
}

function turnToward(w, tx, tz, rate, dt) {
  const target = Math.atan2(tx - w.x, tz - w.z)
  let d = target - w.yaw
  d = Math.atan2(Math.sin(d), Math.cos(d))
  w.yaw += d * (1 - Math.exp(-rate * dt))
  return Math.abs(d)
}

function moveForward(w, speed, dt) {
  w.speed = speed
  w.x += Math.sin(w.yaw) * speed * dt
  w.z += Math.cos(w.yaw) * speed * dt
}

/** player: { x, z, speed, sprinting, alive } */
export function stepWolf(w, player, dt) {
  w.events.length = 0
  const dx = player.x - w.x
  const dz = player.z - w.z
  const dist = Math.hypot(dx, dz)
  const fromHome = Math.hypot(player.x - w.home.x, player.z - w.home.z)
  if (w.cooldown > 0) w.cooldown -= dt
  w.timer += dt

  const setMode = (m) => {
    if (w.mode !== m) { w.mode = m; w.timer = 0; w.events.push(m) }
  }

  switch (w.mode) {
    case 'patrol': {
      const [tx, tz] = w.waypoints[w.wp]
      if (w.pause > 0) {
        w.pause -= dt
        w.speed = 0
      } else {
        turnToward(w, tx, tz, 2.5, dt)
        moveForward(w, WOLF.walkSpeed, dt)
        if (Math.hypot(tx - w.x, tz - w.z) < 1.2) {
          w.wp = (w.wp + 1) % w.waypoints.length
          w.pause = 1.5 + (w.wp % 3)
        }
      }
      if (player.alive && dist < WOLF.noticeRadius) setMode('alert')
      break
    }
    case 'alert': {
      // Noticed: stop, turn to watch, stalk very slowly.
      const off = turnToward(w, player.x, player.z, 3, dt)
      if (off < 0.5 && dist > WOLF.warnRadius + 2) moveForward(w, WOLF.stalkSpeed, dt)
      else w.speed = 0
      if (!player.alive || dist > WOLF.noticeRadius + 6) setMode('patrol')
      else if (dist < WOLF.warnRadius && w.cooldown <= 0) { w.warnTime = 0; setMode('warn') }
      break
    }
    case 'warn': {
      // Clear warning: stand ground facing the player, growling.
      turnToward(w, player.x, player.z, 5, dt)
      w.speed = 0
      const pressing = dist < WOLF.closeRadius || (player.sprinting && dist < WOLF.warnRadius - 2)
      w.warnTime += dt * (pressing ? 2.2 : dist < WOLF.warnRadius ? 1 : -1.2)
      if (w.warnTime < 0) w.warnTime = 0
      if (!player.alive || dist > WOLF.calmRadius) setMode('alert')
      else if (w.warnTime >= WOLF.warnPatience) setMode('charge')
      break
    }
    case 'charge': {
      turnToward(w, player.x, player.z, 7, dt)
      moveForward(w, WOLF.chargeSpeed, dt)
      if (player.alive && dist < WOLF.biteRange) {
        w.events.push('bite')
        w.cooldown = WOLF.cooldown
        setMode('retreat')
      } else if (!player.alive || fromHome > WOLF.leash || w.timer > 6) {
        w.cooldown = WOLF.cooldown * 0.5
        setMode('retreat')
      }
      break
    }
    case 'retreat': {
      turnToward(w, w.home.x, w.home.z, 4, dt)
      moveForward(w, w.timer < 1.5 ? 4.5 : WOLF.walkSpeed, dt)
      if (Math.hypot(w.home.x - w.x, w.home.z - w.z) < 3 || w.timer > 9) setMode('patrol')
      break
    }
    default:
      setMode('patrol')
  }
  w.distance = dist
  return w
}
