import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three'
import { getWorld } from './world/world.js'
import { Terrain } from './scene/Terrain.jsx'
import { Forest } from './scene/Forest.jsx'
import { Rocks } from './scene/Rocks.jsx'
import { Sky, SUN_DIR, FOG_COLOR } from './scene/Sky.jsx'
import { ForestClusters, MountainMassif } from './scene/Distant.jsx'
import { Landmarks } from './scene/Landmarks.jsx'
import { FrostAnomaly, Snowfall } from './scene/Atmosphere.jsx'
import { Aisha } from './actors/Aisha.jsx'
import { Wolf } from './actors/Wolf.jsx'
import { GameLoop } from './gameplay/GameLoop.jsx'
import { attachDesktopInput } from './core/input.js'
import { gameStore, useGame } from './core/store.js'
import { Hud } from './ui/Hud.jsx'
import { Screens } from './ui/Screens.jsx'
import { TouchControls } from './ui/TouchControls.jsx'
import './expedition.css'

function detectQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 600
  return coarse || small ? 'low' : 'high'
}

function Sun({ sunRef, quality }) {
  return (
    <directionalLight
      ref={(l) => {
        sunRef.current = l
        if (l) l.userData.dir = SUN_DIR
      }}
      color="#fff2de"
      intensity={2.6}
      castShadow
      shadow-mapSize={quality === 'low' ? [1024, 1024] : [2048, 2048]}
      shadow-camera-left={-38}
      shadow-camera-right={38}
      shadow-camera-top={38}
      shadow-camera-bottom={-38}
      shadow-camera-near={10}
      shadow-camera-far={260}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  )
}

function Loaded() {
  useEffect(() => { gameStore.set({ loaded: true }) }, [])
  return null
}

// Dev-only: ?skip=forest,rocks,... to isolate scene layers when profiling.
const SKIP = new Set(import.meta.env.DEV ? (new URLSearchParams(window.location.search).get('skip') ?? '').split(',') : [])

function Scene({ world, sim, quality }) {
  const sunRef = useRef()
  const phase = useGame((s) => s.phase)
  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 70, 1500]} />
      <hemisphereLight args={['#c4d8f0', '#7d8796', 1.05]} />
      <ambientLight intensity={0.12} color="#b8c8e0" />
      <Sun sunRef={sunRef} quality={quality} />
      <GameLoop world={world} sim={sim} sunRef={sunRef} />
      <Sky />
      {!SKIP.has('terrain') && <Terrain world={world} />}
      {!SKIP.has('forest') && <Forest world={world} quality={quality} />}
      {!SKIP.has('rocks') && <Rocks world={world} />}
      {!SKIP.has('landmarks') && <Landmarks world={world} />}
      {!SKIP.has('frostanomaly') && <FrostAnomaly world={world} sim={sim} />}
      <Snowfall count={quality === 'low' ? 700 : 1600} paused={phase === 'paused'} />
      <Suspense fallback={null}>
        {!SKIP.has('aisha') && <Aisha sim={sim} />}
        {!SKIP.has('wolf') && <Wolf sim={sim} world={world} />}
        <Loaded />
      </Suspense>
      <Suspense fallback={null}>
        {!SKIP.has('massif') && <MountainMassif world={world} />}
        {!SKIP.has('clusters') && <ForestClusters world={world} range={quality === 'low' ? 80 : 120} />}
      </Suspense>
    </>
  )
}

export default function ExpeditionGame() {
  const world = useMemo(() => getWorld(), [])
  const sim = useRef({})
  const [quality] = useState(detectQuality)
  const canvasRef = useRef()

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return undefined
    return attachDesktopInput(el)
  }, [])

  useEffect(() => {
    document.title = 'Frost — The Frozen Trail'
    // Prevent page scroll / zoom gestures during play.
    const prevent = (e) => { if (e.target.closest?.('.frost-root')) e.preventDefault() }
    document.addEventListener('touchmove', prevent, { passive: false })
    document.addEventListener('gesturestart', prevent)
    return () => {
      document.removeEventListener('touchmove', prevent)
      document.removeEventListener('gesturestart', prevent)
    }
  }, [])

  return (
    <div className="frost-root">
      <Canvas
        ref={canvasRef}
        shadows={{ type: PCFSoftShadowMap }}
        dpr={quality === 'low' ? [1, 1.5] : [1, 2]}
        camera={{ fov: 58, near: 0.1, far: 9000, position: [0, 5, 180] }}
        gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
        onCreated={(state) => {
          state.gl.toneMappingExposure = 1.0
          if (import.meta.env.DEV) window.__frost = { state, sim }
        }}
      >
        <Scene world={world} sim={sim} quality={quality} />
      </Canvas>
      <Hud />
      <TouchControls />
      <Screens />
    </div>
  )
}
