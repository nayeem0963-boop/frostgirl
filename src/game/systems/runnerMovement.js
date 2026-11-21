export const runnerSettings = {
  laneSpacing: 1.15,
  laneTransitionSpeed: 8,
  movementResponsiveness: 12,
  jumpHeight: 1.05,
  jumpDuration: 0.7,
  slideDuration: 0.75,
}

export function lanePosition(lane, laneSpacing) {
  return lane * laneSpacing
}

export function createRunnerMovement(settings = runnerSettings) {
  const state = {
    lane: 0,
    x: 0,
    y: 0,
    action: 'running',
    actionTime: 0,
    slideAmount: 0,
  }

  function reset() {
    Object.assign(state, {
      lane: 0,
      x: 0,
      y: 0,
      action: 'running',
      actionTime: 0,
      slideAmount: 0,
    })
  }

  function move(direction) {
    if (direction !== -1 && direction !== 1) return
    state.lane = Math.max(-1, Math.min(1, state.lane + direction))
  }

  function start(action) {
    if (state.action !== 'running') return false
    state.action = action
    state.actionTime = 0
    return true
  }

  function update(delta) {
    if (delta <= 0) return
    const distance = lanePosition(state.lane, settings.laneSpacing) - state.x
    const smoothStep = Math.abs(distance) * (1 - Math.exp(-settings.movementResponsiveness * delta))
    state.x += Math.sign(distance) * Math.min(smoothStep, settings.laneTransitionSpeed * delta)

    if (state.action === 'jumping') {
      state.actionTime = Math.min(settings.jumpDuration, state.actionTime + delta)
      const progress = state.actionTime / settings.jumpDuration
      state.y = 4 * settings.jumpHeight * progress * (1 - progress)
      if (progress === 1) {
        state.action = 'running'
        state.actionTime = 0
        state.y = 0
      }
    } else if (state.action === 'sliding') {
      state.actionTime = Math.min(settings.slideDuration, state.actionTime + delta)
      if (state.actionTime === settings.slideDuration) {
        state.action = 'running'
        state.actionTime = 0
      }
    }

    const slideTarget = state.action === 'sliding' ? 1 : 0
    state.slideAmount += (slideTarget - state.slideAmount) * (1 - Math.exp(-16 * delta))
  }

  return {
    state,
    settings,
    move,
    jump: () => start('jumping'),
    slide: () => start('sliding'),
    update,
    reset,
  }
}
