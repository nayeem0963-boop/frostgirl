// Unified input state: keyboard, mouse (pointer lock or drag), touch.
// Mutable singleton read by the game loop each frame.
import { actions, gameStore } from './store.js'

export const input = {
  keys: new Set(),
  joyX: 0,
  joyY: 0,
  touchSprint: false,
  jumpQueued: false,
  lookDX: 0,
  lookDY: 0,
  lastLookAt: 0,
  pointerLocked: false,
}

const KEYMAP = {
  KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
  KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
}

export function readMove() {
  const k = input.keys
  let mx = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + input.joyX
  let my = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + input.joyY
  const m = Math.hypot(mx, my)
  if (m > 1) { mx /= m; my /= m }
  return { mx, my, sprint: k.has('sprint') || input.touchSprint }
}

export function consumeJump() {
  const j = input.jumpQueued
  input.jumpQueued = false
  return j
}

export function consumeLook() {
  const d = [input.lookDX, input.lookDY]
  input.lookDX = 0
  input.lookDY = 0
  return d
}

export function addLook(dx, dy) {
  input.lookDX += dx
  input.lookDY += dy
  input.lastLookAt = performance.now()
}

export function resetInput() {
  input.keys.clear()
  input.joyX = 0
  input.joyY = 0
  input.touchSprint = false
  input.jumpQueued = false
  input.lookDX = 0
  input.lookDY = 0
}

/** Attach keyboard + mouse listeners. Returns a cleanup function. */
export function attachDesktopInput(canvas) {
  const onKeyDown = (e) => {
    const phase = gameStore.get().phase
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (e.code === 'KeyP' || phase === 'paused' || !input.pointerLocked) actions.togglePause()
      return
    }
    if (phase !== 'playing') {
      if ((e.code === 'Enter' || e.code === 'Space') && (phase === 'menu' || phase === 'failed' || phase === 'complete')) {
        e.preventDefault()
        actions.start()
      }
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      if (!e.repeat) input.jumpQueued = true
      return
    }
    const k = KEYMAP[e.code]
    if (k) { input.keys.add(k); if (e.code.startsWith('Arrow')) e.preventDefault() }
  }
  const onKeyUp = (e) => {
    const k = KEYMAP[e.code]
    if (k) input.keys.delete(k)
  }
  const onBlur = () => { input.keys.clear(); actions.pause() }

  let dragging = false
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return
    if (gameStore.get().phase !== 'playing') return
    dragging = true
    if (!document.pointerLockElement && canvas.requestPointerLock) {
      try {
        const r = canvas.requestPointerLock()
        if (r && r.catch) r.catch(() => {})
      } catch { /* drag fallback */ }
    }
  }
  const onPointerUp = () => { dragging = false }
  const onMouseMove = (e) => {
    if (gameStore.get().phase !== 'playing') return
    if (document.pointerLockElement === canvas || dragging) addLook(e.movementX, e.movementY)
  }
  const onLockChange = () => {
    const wasLocked = input.pointerLocked
    input.pointerLocked = document.pointerLockElement === canvas
    // Escape releases pointer lock without a keydown event: pause.
    if (wasLocked && !input.pointerLocked && gameStore.get().phase === 'playing') actions.pause()
  }
  const onVisibility = () => { if (document.hidden) actions.pause() }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onLockChange)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    canvas.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('pointerlockchange', onLockChange)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
