import { FrozenKingdom } from './environment/FrozenKingdom'
import { RunTrack } from './environment/RunTrack'
import { RunObjects } from './objects/RunObjects'
import { Player } from './player/Player'
import { RunLoop } from './systems/RunLoop'
import { Snowfall } from './systems/Snowfall'

export function WorldScene({ world, paused, movement, run, resetVersion, onCrystals, onHit, onPause, onStartMessage, onPreviewError, onOrbError }) {
  return (
    <>
      <fog attach="fog" args={[world.fog.color, world.fog.near, world.fog.far]} />
      <hemisphereLight args={[world.lighting.ambient, '#527d9d', 1.7]} />
      <directionalLight position={[-5, 10, 5]} color={world.lighting.sun} intensity={2.5} />
      <RunLoop run={run} paused={paused} resetVersion={resetVersion} onCrystals={onCrystals} onHit={onHit} onPause={onPause} onStartMessage={onStartMessage} />
      <FrozenKingdom run={run} />
      <RunTrack run={run} laneSpacing={movement.settings.laneSpacing} palette={world.palette} />
      <RunObjects run={run} laneSpacing={movement.settings.laneSpacing} onOrbError={onOrbError} />
      <Player movement={movement} run={run} paused={paused} resetVersion={resetVersion} onPreviewError={onPreviewError} />
      <Snowfall paused={paused} run={run} />
    </>
  )
}
