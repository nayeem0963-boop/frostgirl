// Keyboard and swipe -> sim commands. Pure mapping helpers + DOM attachment.
export const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'duck', KeyS: 'duck',
}

export const SWIPE_MIN = 28 // px before a drag counts as a swipe

/** dx/dy in px -> 'left' | 'right' | 'jump' | 'duck' | null (dominant axis wins). */
export function classifySwipe(dx, dy, min = SWIPE_MIN) {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (Math.max(ax, ay) < min) return null
  if (ax > ay * 1.15) return dx < 0 ? 'left' : 'right'
  if (ay > ax * 1.15) return dy < 0 ? 'jump' : 'duck'
  return null
}

/**
 * Attach input to `el` (pointer swipes) and window (keys). `onCommand(cmd)` is
 * called once per key press (auto-repeat ignored) and once per swipe gesture
 * (a gesture fires at most once, as soon as it passes the threshold).
 */
export function attachInput(el, onCommand, { onTap, onKey } = {}) {
  const down = new Set()
  const keydown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const cmd = KEYMAP[e.code]
    if (onKey?.(e)) { e.preventDefault(); return }
    if (!cmd) return
    e.preventDefault()
    if (e.repeat || down.has(e.code)) return
    down.add(e.code)
    onCommand(cmd)
  }
  const keyup = (e) => down.delete(e.code)
  const blur = () => down.clear()
  let g = null
  const pdown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.target?.closest?.('button')) return // buttons (pause, restart, the on-screen pad) are not swipes
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false }
  }
  const pmove = (e) => {
    if (!g || e.pointerId !== g.id || g.fired) return
    const cmd = classifySwipe(e.clientX - g.x, e.clientY - g.y)
    if (cmd) { g.fired = true; onCommand(cmd) }
  }
  const pup = (e) => {
    if (g && e.pointerId === g.id && !g.fired && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 10) onTap?.(e)
    if (g && e.pointerId === g.id) g = null
  }
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', blur)
  el.addEventListener('pointerdown', pdown)
  el.addEventListener('pointermove', pmove)
  el.addEventListener('pointerup', pup)
  el.addEventListener('pointercancel', pup)
  return () => {
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('keyup', keyup)
    window.removeEventListener('blur', blur)
    el.removeEventListener('pointerdown', pdown)
    el.removeEventListener('pointermove', pmove)
    el.removeEventListener('pointerup', pup)
    el.removeEventListener('pointercancel', pup)
  }
}
