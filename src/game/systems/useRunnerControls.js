const commands = {
  ArrowLeft: 'left',
  a: 'left',
  ArrowRight: 'right',
  d: 'right',
  ArrowUp: 'jump',
  w: 'jump',
  ' ': 'jump',
  ArrowDown: 'slide',
  s: 'slide',
}

export function useRunnerControls({ movement, run, paused, togglePaused }) {
  function command(action) {
    if (paused || !run.state.started || run.state.hitType || run.state.stalled) return
    if (action === 'left') movement.move(-1)
    if (action === 'right') movement.move(1)
    if (action === 'jump') movement.jump()
    if (action === 'slide') movement.slide()
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Escape') {
      if (!event.repeat && !run.state.hitType) togglePaused()
      event.preventDefault()
      return
    }
    if (event.target.closest('a, input, textarea, select, [contenteditable="true"]')) return
    if (event.target.closest('button') && event.key === ' ') return
    const action = commands[event.key] || commands[event.key.toLowerCase()]
    if (!action || paused) return
    event.preventDefault()
    if (!event.repeat) command(action)
  }

  function onPointerDown(event) {
    if (!event.target.closest('button, a, input, textarea, select')) {
      event.currentTarget.focus({ preventScroll: true })
    }
  }

  return { command, onKeyDown, onPointerDown }
}
