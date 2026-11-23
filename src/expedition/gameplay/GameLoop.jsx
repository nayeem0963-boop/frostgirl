import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { createPlayer, stepPlayer } from './player.js'
import { createWolf, stepWolf, WOLF } from './wolf.js'
import { createCameraRig, stepCamera } from './camera.js'
import { actions, gameStore } from '../core/store.js'
import { consumeJump, consumeLook, input, readMove, resetInput } from '../core/input.js'
import { LEVEL } from '../world/level.js'
import { TRAIL_LENGTH } from '../world/trail.js'

const ALT_BASE = 1720 // metres above sea level at the trailhead (flavour)

function hintFor(s, p) {
  const L = LEVEL
  if (s < 18) return 'Follow the marked trail up toward Ridge Camp.'
  if (Math.abs(s - L.stream.s) < 12) return 'Frozen stream ahead — the ice is slippery. Slow down.'
  if (Math.abs(s - L.rocks.s) < 11) return 'Rockfall blocks the trail. Jump over the low boulder or pick a way around.'
  if (Math.abs(s - L.snowbank.s) < 10) return 'Deep snowbanks pinch the trail to single file.'
  if (s > L.ledge.s0 - 6 && s < L.ledge.s1) return p.onIce ? 'Ice on the ledge! Lean away from the drop.' : 'Narrow ledge — keep away from the edge.'
  if (Math.abs(s - L.frostStone.s) < 16) return 'An unnatural cold hangs in the air here…'
  if (s > TRAIL_LENGTH - 30) return 'Ridge Camp is just ahead.'
  return ''
}

function resetSim(sim, world) {
  const player = createPlayer(world.start)
  sim.player = player
  sim.wolf = createWolf(LEVEL.wolf)
  sim.rig = createCameraRig(player, sim.mobile ? 6.2 : 5.2)
  if (sim.mobile) sim.rig.pitch = 0.24
  sim.celebrating = false
  sim.spirit = { alpha: 0, t: -1, shown: false, y: world.height(LEVEL.spirit.x, LEVEL.spirit.z) + 2.2 }
  sim.stats = { time: 0, damage: 0, maxS: 0, wolfEscaped: false, wolfBites: 0 }
  sim.publishT = 0
  sim.frost = 0
  sim.hurt = 0
  resetInput()
}

export function GameLoop({ world, sim, sunRef }) {
  const { camera, size } = useThree()
  const runId = useRef(-1)
  sim.current.mobile = size.width < 820 || matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    if (!sim.current.player) resetSim(sim.current, world)
  }, [sim, world])

  useFrame((state, raw) => {
    if (import.meta.env.DEV && !window.__frost) window.__frost = { state, sim }
    const S = sim.current
    const g = gameStore.get()
    if (g.runId !== runId.current) {
      runId.current = g.runId
      resetSim(S, world)
    }
    const dt = Math.max(0, Math.min(raw, 1 / 30))
    const p = S.player
    const playing = g.phase === 'playing'
    S.paused = g.phase === 'paused' || g.phase === 'menu' || g.phase === 'failed'

    if (playing) {
      const mv = readMove()
      const look = consumeLook()
      const manual = performance.now() - input.lastLookAt < 1400
      stepPlayer(p, { ...mv, jump: consumeJump(), camYaw: S.rig.yaw }, dt, world)
      S.stats.time += dt

      // Wolf
      const wolfPrev = S.wolf.mode
      stepWolf(S.wolf, { x: p.x, z: p.z, speed: p.speed, sprinting: p.sprinting, alive: true }, dt)
      if (S.wolf.events.includes('bite')) {
        p.health -= WOLF.biteDamage
        S.stats.damage += WOLF.biteDamage
        S.stats.wolfBites++
        const dx = p.x - S.wolf.x
        const dz = p.z - S.wolf.z
        const l = Math.hypot(dx, dz) || 1
        p.vx = (dx / l) * 6
        p.vz = (dz / l) * 6
        p.vy = 3.5
        p.grounded = false
        p.peakY = p.y
        p.hurtTimer = 0.8
        S.hurt = 1
      }
      if (wolfPrev === 'warn' && S.wolf.mode === 'alert') S.stats.wolfEscaped = true

      // Frost anomaly: numbing cold close to the stone; a spirit glimpsed once.
      const fd = Math.hypot(p.x - LEVEL.frostStone.x, p.z - LEVEL.frostStone.z)
      const frostTarget = fd < 4 ? 1 : fd < 16 ? (16 - fd) / 24 : 0
      S.frost += (frostTarget - S.frost) * Math.min(1, dt * 2)
      if (fd < 3.6) {
        p.health -= 7 * dt
        S.stats.damage += 7 * dt
        p.stamina = Math.max(0, p.stamina - 10 * dt)
      }
      const sp = S.spirit
      if (!sp.shown && fd < 42) { sp.shown = true; sp.t = 0 }
      if (sp.t >= 0) {
        sp.t += dt
        sp.alpha = sp.t < 1.6 ? sp.t / 1.6 : sp.t < 3.6 ? 1 : Math.max(0, 1 - (sp.t - 3.6) / 1.4)
        if (sp.t > 5) sp.t = -1
      }

      if (p.events.includes('hurt')) { S.stats.damage += 10; S.hurt = 1 }
      S.hurt = Math.max(0, S.hurt - dt * 1.6)

      // Progress + checkpoint
      const surf = world.surface(p.x, p.z, {})
      if (surf.d < 12) S.stats.maxS = Math.max(S.stats.maxS, surf.s)
      const cd = Math.hypot(p.x - LEVEL.checkpoint.x, p.z - LEVEL.checkpoint.z)

      if (p.events.includes('fell')) {
        actions.fail('Aisha slipped from the ledge into the ravine.')
      } else if (p.health <= 0) {
        p.health = 0
        actions.fail(S.wolf.mode === 'retreat' ? 'The wolf defended its territory.' : 'The cold and the mountain took their toll.')
      } else if (cd < 3.4) {
        S.celebrating = true
        p.vx = p.vz = 0
        p.anim = 'idle'
        actions.complete({
          time: S.stats.time,
          climb: Math.round(p.y - world.start.y),
          altitude: Math.round(ALT_BASE + p.y * 7.4),
          damage: Math.round(S.stats.damage),
          wolf: S.stats.wolfBites ? `Bitten ${S.stats.wolfBites}×` : 'Avoided',
        })
      }

      // Publish UI snapshot ~10 Hz
      S.publishT -= dt
      if (S.publishT <= 0) {
        S.publishT = 0.1
        const wm = S.wolf.mode
        gameStore.set({
          health: Math.max(0, Math.round(p.health)),
          stamina: Math.round(p.stamina),
          exhausted: p.exhausted,
          progress: Math.min(1, S.stats.maxS / TRAIL_LENGTH),
          altitude: Math.round(ALT_BASE + p.y * 7.4),
          hint: hintFor(surf.s, p),
          warning: wm === 'warn' ? 'The wolf bares its teeth — back away slowly.'
            : wm === 'charge' ? 'The wolf charges! Get away!'
              : wm === 'alert' && S.wolf.distance < 22 ? 'A wolf is watching you from the trees.' : '',
          frost: Math.round(S.frost * 100) / 100,
          hurt: Math.round(S.hurt * 100) / 100,
        })
      }
      stepCamera(S.rig, p, look, dt, world, { manualRecent: manual })
    } else if (g.phase === 'complete') {
      // Celebration: slow orbit around Aisha.
      S.rig.yaw += dt * 0.25
      S.rig.pitch += (0.18 - S.rig.pitch) * dt
      stepCamera(S.rig, { ...p, speed: 0 }, [0, 0], dt, world)
    } else if (g.phase === 'menu') {
      // Attract mode: drift slowly around the trailhead, looking up the valley.
      // Behind and above Aisha, looking up the valley toward the massif.
      S.rig.yaw = p.yaw + Math.PI + 0.35 + Math.sin(state.clock.elapsedTime * 0.06) * 0.2
      S.rig.pitch = 0.16
      S.rig.distance = 7.5
      stepCamera(S.rig, p, [0, 0], dt, world)
    }

    // Apply camera
    const R = S.rig
    camera.position.set(R.x, R.y, R.z)
    camera.lookAt(R.tx, R.ty + (g.phase === 'menu' ? 3.2 : 0.15), R.tz)
    const fovTarget = (S.mobile && size.height > size.width ? 68 : 58) + (p.sprinting && p.speed > 4 ? 5 : 0)
    if (Math.abs(camera.fov - fovTarget) > 0.05) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4)
      camera.updateProjectionMatrix()
    }

    // Sun + shadow frustum follow the player.
    const sun = sunRef.current
    if (sun) {
      const d = sun.userData.dir
      sun.position.set(p.x + d.x * 120, p.y + d.y * 120, p.z + d.z * 120)
      sun.target.position.set(p.x, p.y, p.z)
      sun.target.updateMatrixWorld()
    }
  }, -1)

  return null
}
