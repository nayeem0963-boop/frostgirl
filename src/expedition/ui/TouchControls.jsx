import { useEffect, useRef, useState } from 'react'
import { addLook, input } from '../core/input.js'
import { useGame } from '../core/store.js'

/**
 * Mobile controls: floating joystick (left half), drag-to-look (right half),
 * jump + sprint buttons. Only rendered for touch devices.
 */
export function TouchControls() {
  const phase = useGame((s) => s.phase)
  const [touch] = useState(() => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0)
  const [stick, setStick] = useState(null) // {x, y, kx, ky}
  const [sprint, setSprint] = useState(false)
  const ids = useRef({ move: null, look: null, lx: 0, ly: 0, ox: 0, oy: 0 })

  useEffect(() => { input.touchSprint = sprint }, [sprint])
  useEffect(() => {
    if (phase !== 'playing') { setStick(null); input.joyX = 0; input.joyY = 0 }
  }, [phase])

  if (!touch || phase !== 'playing') return null
  const R = 52

  const onStart = (e) => {
    for (const t of e.changedTouches) {
      if (t.target.closest('.fr-tbtn')) continue
      if (t.clientX < window.innerWidth * 0.45 && ids.current.move === null) {
        ids.current.move = t.identifier
        ids.current.ox = t.clientX
        ids.current.oy = t.clientY
        setStick({ x: t.clientX, y: t.clientY, kx: 0, ky: 0 })
      } else if (ids.current.look === null) {
        ids.current.look = t.identifier
        ids.current.lx = t.clientX
        ids.current.ly = t.clientY
      }
    }
  }
  const onMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === ids.current.move) {
        let dx = t.clientX - ids.current.ox
        let dy = t.clientY - ids.current.oy
        const l = Math.hypot(dx, dy)
        if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R }
        input.joyX = dx / R
        input.joyY = -dy / R
        setStick((s) => s && { ...s, kx: dx, ky: dy })
      } else if (t.identifier === ids.current.look) {
        addLook((t.clientX - ids.current.lx) * 1.5, (t.clientY - ids.current.ly) * 1.2)
        ids.current.lx = t.clientX
        ids.current.ly = t.clientY
      }
    }
  }
  const onEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === ids.current.move) {
        ids.current.move = null
        input.joyX = 0
        input.joyY = 0
        setStick(null)
      } else if (t.identifier === ids.current.look) {
        ids.current.look = null
      }
    }
  }

  return (
    <div className="fr-touch" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      {stick ? (
        <div className="fr-stick" style={{ left: stick.x, top: stick.y }}>
          <div className="fr-knob" style={{ transform: `translate(${stick.kx}px, ${stick.ky}px)` }} />
        </div>
      ) : (
        <div className="fr-stick-hint">Drag to move</div>
      )}
      <div className="fr-tbtns">
        <button
          className={`fr-tbtn is-sprint ${sprint ? 'is-on' : ''}`}
          onTouchStart={(e) => { e.stopPropagation(); setSprint((v) => !v) }}
          aria-pressed={sprint}
        >Sprint</button>
        <button
          className="fr-tbtn is-jump"
          onTouchStart={(e) => { e.stopPropagation(); input.jumpQueued = true }}
        >Jump</button>
      </div>
    </div>
  )
}
