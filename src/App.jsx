import { useState } from 'react'
import { GameViewport } from './game/GameViewport'
import { createRunnerMovement } from './game/systems/runnerMovement'
import { createRunSimulation, runSettings } from './game/systems/runSimulation'
import { useRunnerControls } from './game/systems/useRunnerControls'
import { GameOverlay } from './ui/GameOverlay'
import { useSceneSettings } from './state/useSceneSettings'
import { worlds } from './worlds/config'
import './styles/game.css'

export default function App() {
  const world = worlds[0]
  const spiral = !(import.meta.env.DEV && new URLSearchParams(window.location.search).get('track') === 'straight')
  const [movement] = useState(createRunnerMovement)
  const [run] = useState(() => createRunSimulation(movement, { ...runSettings, obstacleTypes: world.obstacles }, { interactiveObjects: !spiral }))
  const { paused, pause, togglePaused, reset, resetVersion, crystals, setCrystals, hit, setHit, startMessage, setStartMessage } = useSceneSettings()
  const stopped = paused || hit !== null
  const controls = useRunnerControls({ movement, run, paused: stopped, togglePaused })

  return (
    <main className="game-shell" tabIndex={0} aria-label="Frost Girl game" onKeyDown={controls.onKeyDown} onPointerDown={controls.onPointerDown}>
      <GameViewport spiral={spiral} world={world} paused={stopped} movement={movement} run={run} resetVersion={resetVersion} onCrystals={setCrystals} onHit={setHit} onPause={pause} onStartMessage={setStartMessage} />
      <GameOverlay world={world} paused={paused} hit={hit} crystals={crystals} startMessage={startMessage} onTogglePaused={togglePaused} onReset={() => reset(movement, run)} onCommand={controls.command} />
    </main>
  )
}
