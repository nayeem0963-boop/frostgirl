import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'

export function RunLoop({ run, paused, resetVersion, onCrystals, onHit, onPause, onStartMessage }) {
  const skipDelta = useRef(true)
  const lastCrystals = useRef(0)
  const lastMessage = useRef(null)

  useLayoutEffect(() => {
    if (paused) skipDelta.current = true
  }, [paused])

  useLayoutEffect(() => {
    skipDelta.current = true
    lastCrystals.current = 0
    lastMessage.current = null
  }, [resetVersion])

  useFrame((_, delta) => {
    if (paused || run.state.hitType) return
    if (!skipDelta.current && delta > 2) {
      skipDelta.current = true
      run.suspend()
      onPause()
      return
    }
    run.resume()
    const step = skipDelta.current ? 0 : delta
    skipDelta.current = false
    run.update(step)
    if (run.state.startMessage !== lastMessage.current) {
      lastMessage.current = run.state.startMessage
      onStartMessage(run.state.startMessage)
    }
    if (run.state.crystals !== lastCrystals.current) {
      lastCrystals.current = run.state.crystals
      onCrystals(run.state.crystals)
    }
    if (run.state.hitType) onHit(run.state.hitType)
  }, -2)

  return null
}
