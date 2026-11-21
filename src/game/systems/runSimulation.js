import { lanePosition } from './runnerMovement.js'
import { CRYSTAL_HEIGHT, CRYSTAL_RADIUS, PLAYER_BASE_Y } from './runGeometry.js'

export const runSettings = {
  initialSpeed: 3.4,
  maximumSpeed: 5,
  acceleration: 0.018,
  spawnDistance: 140,
  spawnFadeStart: 100,
  spawnFadeEnd: 130,
  initialObstacleDistance: 60,
  obstacleSpacing: 26,
  spawnInterval: 4,
  minReactionTime: 4.5,
  safeRunningTime: 12,
  simpleObstacleCount: 5,
  patternRampTime: 30,
  readyDuration: 0.35,
  countdownInterval: 0.55,
  goDuration: 0.5,
  playerZ: -3,
  collisionStep: 1 / 120,
  obstacleTypes: ['iceBlock', 'snowBarrier', 'fallenPine'],
  crystalColor: '#ffd36e',
  crystalValue: 1,
}

export const obstacleTypes = {
  iceBlock: { width: 0.96, height: 1.28, halfDepth: 0.48, jumpable: false },
  snowBarrier: { width: 0.98, height: 0.48, halfDepth: 0.18, jumpable: true },
  fallenPine: { width: 0.94, height: 0.4, halfDepth: 0.18, jumpable: true },
}

const lanes = [-1, 1, -1, 1, -1, 0, 1, 0, -1, 0, 1, 0, -1, 0, 1, -1, 0, 1]
const crystalLanes = [-1, 0, 1, 1, 0, -1, -1, 0, 0, 1, 0, -1, 0, 1, 1, 0, -1, 0]
const typePattern = [0, 1, 2, 1, 0, 2, 0, 1, 0, 2, 1, 2, 0, 2, 1, 0, 1, 2]
export const RUN_POOL_SIZE = 6
const playerHalfDepth = 0.15
const playerHalfWidth = 0.14
const recycleBehindPlayer = 5

function crossed(previousZ, currentZ, playerZ, radius) {
  return previousZ <= playerZ + radius && currentZ >= playerZ - radius
}

export function createRunSimulation(movement, settings = runSettings, { interactiveObjects = true } = {}) {
  if (settings.obstacleTypes.length === 0 || settings.obstacleTypes.some((type) => !obstacleTypes[type])) {
    throw new Error('Run settings must contain known obstacle types')
  }
  const simpleTypes = settings.obstacleTypes.filter((type) => obstacleTypes[type].jumpable)
  const spawnDistance = Math.max(settings.spawnDistance, settings.maximumSpeed * settings.minReactionTime)
  const spacing = Math.max(settings.obstacleSpacing, settings.maximumSpeed * settings.spawnInterval, (spawnDistance + recycleBehindPlayer) / RUN_POOL_SIZE)
  const collisionRadius = Math.max(...settings.obstacleTypes.map((type) => obstacleTypes[type].halfDepth)) + playerHalfDepth
  const firstObstacleDistance = Math.max(settings.initialObstacleDistance, settings.maximumSpeed * settings.safeRunningTime, settings.maximumSpeed * settings.minReactionTime + spacing / 2) + collisionRadius + 1e-6
  const introDuration = settings.readyDuration + 3 * settings.countdownInterval
  const state = {
    distance: 0,
    elapsed: 0,
    speed: settings.initialSpeed,
    introTime: 0,
    started: false,
    startMessage: 'READY',
    crystals: 0,
    hitType: null,
    stalled: false,
    obstacles: Array.from({ length: RUN_POOL_SIZE }, () => ({})),
    collectibles: Array.from({ length: RUN_POOL_SIZE }, () => ({})),
    effect: { active: false, age: 0, x: 0, y: 0, z: 0, distance: 0 },
    snowEffect: { active: false, age: 0, x: 0, distance: 0, landing: false },
  }
  let nextObstacle = 0
  let nextCrystal = 0
  let lastObstacleType = null
  let lastAction = 'running'

  function configureObstacle(item, sequence, z) {
    const simple = sequence < settings.simpleObstacleCount || state.elapsed < settings.patternRampTime
    const choices = simple && simpleTypes.length > 0 ? simpleTypes : settings.obstacleTypes
    let choice = typePattern[sequence % typePattern.length] % choices.length
    if (choices.length > 1 && choices[choice] === lastObstacleType) choice = (choice + 1) % choices.length
    item.type = choices[choice]
    lastObstacleType = item.type
    item.lane = lanes[sequence % lanes.length]
    item.z = z
  }

  function configureCrystal(item, sequence, z) {
    item.lane = crystalLanes[sequence % crystalLanes.length]
    item.z = z
    item.active = true
    item.color = settings.crystalColor
    item.value = settings.crystalValue
  }

  function reset() {
    lastObstacleType = null
    state.distance = 0
    state.elapsed = 0
    state.speed = settings.initialSpeed
    state.introTime = 0
    state.started = introDuration === 0
    state.startMessage = state.started ? (settings.goDuration > 0 ? 'GO!' : null) : 'READY'
    state.crystals = 0
    state.hitType = null
    state.stalled = false
    state.effect.active = false
    state.effect.age = 0
    state.snowEffect.active = false
    state.snowEffect.age = 0
    lastAction = 'running'
    nextObstacle = RUN_POOL_SIZE
    nextCrystal = RUN_POOL_SIZE
    for (let index = 0; index < RUN_POOL_SIZE; index += 1) {
      configureObstacle(
        state.obstacles[index],
        index,
        settings.playerZ - firstObstacleDistance - spacing * index,
      )
      configureCrystal(
        state.collectibles[index],
        index,
        settings.playerZ - firstObstacleDistance + spacing / 2 - spacing * index,
      )
    }
  }

  function recycleZ(items) {
    let furthest = Infinity
    for (const item of items) furthest = Math.min(furthest, item.z)
    return Math.min(furthest - spacing, settings.playerZ - spawnDistance)
  }

  function step(delta) {
    const previousAction = movement.state.action
    if (previousAction === 'jumping' && lastAction !== 'jumping') {
      Object.assign(state.snowEffect, { active: true, age: 0, x: movement.state.x, distance: state.distance, landing: false })
    }
    movement.update(delta)
    const player = movement.state
    if (previousAction === 'jumping' && player.action === 'running') {
      Object.assign(state.snowEffect, { active: true, age: 0, x: player.x, distance: state.distance, landing: true })
    }
    lastAction = player.action
    const travel = Math.min(settings.maximumSpeed, settings.initialSpeed + settings.acceleration * (state.elapsed + delta / 2)) * delta
    state.elapsed += delta
    state.speed = Math.min(settings.maximumSpeed, settings.initialSpeed + settings.acceleration * state.elapsed)
    if (state.elapsed >= settings.goDuration) state.startMessage = null
    state.distance += travel
    if (state.effect.active) {
      state.effect.age += delta
      if (state.effect.age >= 0.5) state.effect.active = false
    }
    if (state.snowEffect.active) {
      state.snowEffect.age += delta
      if (state.snowEffect.age >= 0.4) state.snowEffect.active = false
    }

    if (!interactiveObjects) return

    for (const obstacle of state.obstacles) {
      const previousZ = obstacle.z
      obstacle.z += travel
      const type = obstacleTypes[obstacle.type]
      const inLane = Math.abs(player.x - lanePosition(obstacle.lane, movement.settings.laneSpacing)) < type.width / 2 + playerHalfWidth
      if (inLane && crossed(previousZ, obstacle.z, settings.playerZ, type.halfDepth + playerHalfDepth)) {
        const avoided = type.jumpable && player.y >= type.height
        if (!avoided) {
          state.hitType = obstacle.type
          state.effect.active = false
          state.snowEffect.active = false
          return
        }
      }
      if (obstacle.z > settings.playerZ + recycleBehindPlayer) {
        configureObstacle(obstacle, nextObstacle++, recycleZ(state.obstacles))
      }
    }

    for (const crystal of state.collectibles) {
      const previousZ = crystal.z
      crystal.z += travel
      if (
        crystal.active &&
        Math.abs(player.x - lanePosition(crystal.lane, movement.settings.laneSpacing)) < 0.52 &&
        player.y + PLAYER_BASE_Y <= CRYSTAL_HEIGHT + CRYSTAL_RADIUS &&
        crossed(previousZ, crystal.z, settings.playerZ, 0.4)
      ) {
        crystal.active = false
        state.crystals += crystal.value
        state.effect.active = true
        state.effect.age = 0
        state.effect.x = lanePosition(crystal.lane, movement.settings.laneSpacing)
        state.effect.y = CRYSTAL_HEIGHT
        state.effect.z = crystal.z
        state.effect.distance = state.distance
      }
      if (crystal.z > settings.playerZ + recycleBehindPlayer) {
        configureCrystal(crystal, nextCrystal++, recycleZ(state.collectibles))
      }
    }
  }

  function update(delta) {
    if (delta <= 0 || state.hitType || state.stalled) return
    let remaining = delta
    while (remaining > 1e-9 && !state.hitType) {
      const time = Math.min(remaining, settings.collisionStep)
      const introStep = Math.min(time, Math.max(0, introDuration - state.introTime))
      state.introTime += introStep
      if (state.introTime >= introDuration) {
        state.started = true
        state.startMessage = state.elapsed < settings.goDuration ? 'GO!' : null
      } else if (state.introTime < settings.readyDuration) {
        state.startMessage = 'READY'
      } else {
        state.startMessage = String(3 - Math.floor((state.introTime - settings.readyDuration) / settings.countdownInterval))
      }
      if (time > introStep) step(time - introStep)
      remaining -= time
    }
  }

  reset()
  return {
    state,
    settings,
    update,
    reset,
    suspend: () => { state.stalled = true },
    resume: () => { state.stalled = false },
  }
}

