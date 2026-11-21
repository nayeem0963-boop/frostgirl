import { useEffect, useState } from 'react'

export function useSceneSettings() {
  const [paused, setPaused] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const [resetVersion, setResetVersion] = useState(0)
  const [crystals, setCrystals] = useState(0)
  const [hit, setHit] = useState(null)
  const [startMessage, setStartMessage] = useState('READY')

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return {
    paused,
    resetVersion,
    crystals,
    hit,
    startMessage,
    setStartMessage,
    setCrystals,
    setHit,
    pause: () => setPaused(true),
    togglePaused: () => {
      if (!hit) setPaused((value) => !value)
    },
    reset: (movement, run) => {
      movement.reset()
      run.reset()
      setCrystals(0)
      setHit(null)
      setStartMessage(run.state.startMessage)
      setResetVersion((value) => value + 1)
    },
  }
}
