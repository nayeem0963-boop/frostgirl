import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect, useState } from 'react'
import { WorldScene } from './WorldScene'
import { SpiralScene } from './SpiralScene'
import { configureRunnerCamera } from './systems/runnerCamera'
import { CAMERA_FAR } from './systems/runGeometry'

function RunnerCamera({ playerZ }) {
  const { camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    configureRunnerCamera(camera, size, playerZ)
    invalidate()
  }, [camera, size, playerZ, invalidate])
  return null
}

export function GameViewport({ spiral, world, paused, movement, run, resetVersion, onCrystals, onHit, onPause, onStartMessage }) {
  const [previewError, setPreviewError] = useState(false)
  const [orbError, setOrbError] = useState(false)
  return (
    <div
      className="game-viewport"
      aria-label={`${world.name} 3D scene`}
      role="img"
    >
      <Canvas
        camera={{ position: [0, 5.8, 9], fov: 42, near: 0.1, far: CAMERA_FAR }}
        dpr={[1, 1.5]}
        frameloop={paused ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        fallback={<div className="webgl-fallback">3D is unavailable on this device.</div>}
      >
        {spiral ? (
          <SpiralScene world={world} paused={paused} movement={movement} run={run} resetVersion={resetVersion} onCrystals={onCrystals} onHit={onHit} onPause={onPause} onStartMessage={onStartMessage} onPreviewError={() => setPreviewError(true)} />
        ) : (
          <>
            <RunnerCamera playerZ={run.settings.playerZ} />
            <WorldScene world={world} paused={paused} movement={movement} run={run} resetVersion={resetVersion} onCrystals={onCrystals} onHit={onHit} onPause={onPause} onStartMessage={onStartMessage} onPreviewError={() => setPreviewError(true)} onOrbError={() => setOrbError(true)} />
          </>
        )}
      </Canvas>
      {previewError && (
        <div role="alert" style={{ position: 'absolute', top: '5rem', left: '50%', transform: 'translateX(-50%)', background: '#243c4e', color: 'white', padding: '0.5rem', textAlign: 'center', zIndex: 2 }}>
          Character preview failed to load. Using placeholder.
        </div>
      )}
      {orbError && (
        <div role="alert" style={{ position: 'absolute', top: '7rem', left: '50%', transform: 'translateX(-50%)', background: '#243c4e', color: 'white', padding: '0.5rem', textAlign: 'center', zIndex: 2 }}>
          Collectible orb failed to load. Using placeholder.
        </div>
      )}
    </div>
  )
}
