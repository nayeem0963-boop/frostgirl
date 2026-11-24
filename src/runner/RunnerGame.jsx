// Frost — Phase 1: three-lane snowy-trail runner with Aisha.
// Sim (sim/sim.js) is pure and fixed-step; this file wires it to the scene,
// camera, input and screens.
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import { Sky, FOG_COLOR } from '../expedition/scene/Sky.jsx'
import { MountainMassif } from '../expedition/scene/Distant.jsx'
import { Snowfall } from '../expedition/scene/Atmosphere.jsx'
import { Ground } from './scene/Ground.jsx'
import { RunnerForest } from './scene/RunnerForest.jsx'
import { Obstacles } from './scene/Obstacles.jsx'
import { RunnerAisha } from './scene/RunnerAisha.jsx'
import { createSim, startRun, resetToReady, update, command } from './sim/sim.js'
import { attachInput } from './sim/input.js'
import { cameraFor, cameraTarget } from './sim/camera.js'
import './runner.css'

const FLAT_WORLD = { height: () => 0 } // MountainMassif only needs a ground height
const SUN = new Vector3(-0.42, 0.36, 0.83).normalize()

function detectQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches
  return coarse || Math.min(window.innerWidth, window.innerHeight) < 600 ? 'low' : 'high'
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  gr.addColorStop(0, 'rgba(30,50,90,0.55)'); gr.addColorStop(1, 'rgba(30,50,90,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace
  return t
}

function Shadow({ sim }) {
  const map = useMemo(blobTexture, [])
  const ref = useRef()
  useFrame(() => {
    const s = sim.current
    if (!ref.current) return
    ref.current.position.set(s.x, 0.03, 0)
    const k = 1 / (1 + s.y * 0.8)
    ref.current.scale.set(1.5 * k, 1.5 * k, 1)
    ref.current.material.opacity = 0.8 * k
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
    </mesh>
  )
}

/** Steps the sim, publishes UI state, and drives the chase camera. */
function Loop({ sim, onPhase, onScore, debug }) {
  const last = useRef({ phase: '', score: -1, paused: false })
  const pos = useRef(new Vector3(0, 2.75, 5.8))
  const look = useRef(new Vector3(0, 1.1, -14))
  const tgt = useMemo(() => ({}), [])
  const first = useRef(true)

  useFrame(({ camera, size }, rawDt) => {
    const s = sim.current
    const dt = Math.min(rawDt, 0.05)
    update(s, rawDt)
    s.events.length = 0 // nothing consumes frame events yet; keep the queue from growing
    if (debug) debug.frames = (debug.frames ?? 0) + 1

    const rig = cameraFor(size.width / size.height)
    if (camera.fov !== rig.fov) { camera.fov = rig.fov; camera.updateProjectionMatrix() }
    cameraTarget(rig, s, tgt)
    const k = first.current ? 1 : 1 - Math.exp(-7 * dt)
    first.current = false
    pos.current.x += (tgt.px - pos.current.x) * k
    pos.current.y += (tgt.py - pos.current.y) * k
    pos.current.z += (tgt.pz - pos.current.z) * k
    look.current.x += (tgt.lx - look.current.x) * k
    look.current.y += (tgt.ly - look.current.y) * k
    look.current.z = tgt.lz
    camera.position.copy(pos.current)
    camera.lookAt(look.current)

    const l = last.current
    if (l.phase !== s.phase || l.paused !== s.paused) { l.phase = s.phase; l.paused = s.paused; onPhase(s.phase, s.paused) }
    const score = Math.floor(s.dist)
    if (score !== l.score && (score - l.score >= 1 || score === 0)) { l.score = score; onScore(score) }
  })
  return null
}

function Scene({ sim, quality, onPhase, onScore, debug }) {
  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 70, 520]} />
      <hemisphereLight args={['#c4d8f0', '#7d8796', 1.15]} />
      <ambientLight intensity={0.15} color="#b8c8e0" />
      <directionalLight position={SUN.clone().multiplyScalar(60).toArray()} color="#fff2de" intensity={2.5} />
      <Loop sim={sim} onPhase={onPhase} onScore={onScore} debug={debug} />
      <Sky />
      <Ground sim={sim} />
      <Obstacles sim={sim} />
      <Shadow sim={sim} />
      <Snowfall count={quality === 'low' ? 500 : 1100} paused={false} />
      <Suspense fallback={null}>
        <RunnerForest sim={sim} />
        <RunnerAisha sim={sim} />
        <Ready />
      </Suspense>
      <Suspense fallback={null}>
        <MountainMassif world={FLAT_WORLD} />
      </Suspense>
    </>
  )
}

let readyCb = () => {}
function Ready() {
  useEffect(() => { readyCb() }, [])
  return null
}

export default function RunnerGame() {
  const sim = useRef(null)
  if (!sim.current) { sim.current = createSim(); sim.current.phase = 'ready'; sim.current.anim = 'idle' }
  const [phase, setPhase] = useState('ready')
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem('frost-runner-best')) || 0 } catch { return 0 } })
  const [loaded, setLoaded] = useState(false)
  const [quality] = useState(detectQuality)
  const root = useRef(null)
  const debug = useMemo(() => (new URLSearchParams(window.location.search).has('debug') ? {} : null), [])
  const hitAt = useRef(0)

  useEffect(() => { readyCb = () => setLoaded(true); return () => { readyCb = () => {} } }, [])

  const start = useCallback(() => {
    const s = sim.current
    if (s.phase === 'running') return
    if (s.phase === 'gameover' && performance.now() - hitAt.current < 450) return // no accidental instant restart
    startRun(s, (Math.random() * 1e9) | 0)
    setScore(0)
  }, [])
  const togglePause = useCallback(() => {
    const s = sim.current
    if (s.phase === 'running') s.paused = !s.paused
  }, [])

  const onPhase = useCallback((p, pz) => {
    setPhase(p); setPaused(pz)
    if (p === 'gameover') {
      hitAt.current = performance.now()
      setScore((sc) => { setBest((b) => { const nb = Math.max(b, sc); try { localStorage.setItem('frost-runner-best', String(nb)) } catch { /* private mode */ } return nb }); return sc })
    }
  }, [])

  useEffect(() => {
    const el = root.current
    const detach = attachInput(
      el,
      (cmd) => command(sim.current, cmd),
      {
        onKey: (e) => {
          const s = sim.current
          if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) togglePause(); return true }
          if (s.phase !== 'running' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) { if (!e.repeat) start(); return true }
          if (s.phase === 'running' && s.paused && e.code === 'Enter') { if (!e.repeat) togglePause(); return true }
          return false
        },
      },
    )
    const hide = () => { if (document.hidden && sim.current.phase === 'running') sim.current.paused = true }
    document.addEventListener('visibilitychange', hide)
    const prevent = (e) => e.preventDefault()
    el.addEventListener('touchmove', prevent, { passive: false })
    document.title = 'Frost — Run'
    return () => { detach(); document.removeEventListener('visibilitychange', hide); el.removeEventListener('touchmove', prevent) }
  }, [start, togglePause])

  useEffect(() => {
    if (debug) window.__frostRunner = { sim: sim.current, command: (c) => command(sim.current, c), start, reset: () => resetToReady(sim.current), debug }
  }, [debug, start])

  return (
    <div className="runner-root" ref={root} data-phase={phase} data-paused={paused} data-loaded={loaded}>
      <Canvas
        dpr={quality === 'low' ? [1, 1.5] : [1, 2]}
        camera={{ fov: 58, near: 0.1, far: 7000, position: [0, 2.75, 5.8] }}
        gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
      >
        <Scene sim={sim} quality={quality} onPhase={onPhase} onScore={setScore} debug={debug} />
      </Canvas>

      <div className="runner-hud" aria-live="polite">
        <span className="runner-score">{score} m</span>
        {best > 0 && <span className="runner-best">Best {best} m</span>}
        {phase === 'running' && <button className="runner-pause" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? '▶' : 'Ⅱ'}</button>}
      </div>

      {!loaded && <div className="runner-screen"><p className="runner-loading">Loading Frost…</p></div>}

      {loaded && phase === 'ready' && (
        <div className="runner-screen" data-screen="start">
          <h1>Frost</h1>
          <p className="runner-tag">Run the snowy trail with Aisha</p>
          <button className="runner-btn" onClick={start} autoFocus>Start run</button>
          <ul className="runner-help">
            <li><b>← →</b> / A D · swipe: change lane</li>
            <li><b>↑</b> / W / Space · swipe up: jump</li>
            <li><b>↓</b> / S · swipe down: duck</li>
          </ul>
        </div>
      )}

      {phase === 'running' && paused && (
        <div className="runner-screen" data-screen="paused">
          <h2>Paused</h2>
          <button className="runner-btn" onClick={togglePause}>Resume</button>
        </div>
      )}

      {phase === 'gameover' && (
        <div className="runner-screen" data-screen="gameover">
          <h2>You hit the ice</h2>
          <p className="runner-tag">{score} m{best > 0 && score >= best ? ' · new best!' : ''}</p>
          <button className="runner-btn" onClick={start}>Restart</button>
          <p className="runner-hint">Enter · Space · R</p>
        </div>
      )}
    </div>
  )
}
