// Frost — Phase 1: three-lane snowy-trail runner with Aisha.
// Sim (sim/sim.js) is pure and fixed-step; this file wires it to the scene,
// camera, input and screens.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, PointsMaterial, BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import { Sky } from '../expedition/scene/Sky.jsx'
import { MountainMassif } from '../expedition/scene/Distant.jsx'
import { Snowfall } from '../expedition/scene/Atmosphere.jsx'
import { Ground } from './scene/Ground.jsx'
import { Backdrop } from './scene/Backdrop.jsx'
import { FinishGate } from './scene/FinishGate.jsx'
import { Wolves } from './scene/Wolves.jsx'
import { pickWorld, unlockAllRequested } from './worlds.js'
import { loadProgress, saveProgress, recordRun, nextWorldId, describeWorlds } from './progress.js'
import { worldIds } from '../worlds/runnerThemes.js'
import { worlds as allWorlds } from '../worlds/config.js'
import { RunnerForest } from './scene/RunnerForest.jsx'
import { Obstacles } from './scene/Obstacles.jsx'
import { Orbs } from './scene/Orbs.jsx'
import { RunnerAisha } from './scene/RunnerAisha.jsx'
import { createSim, startRun, resetToReady, update, command, aheadOf } from './sim/sim.js'
import { attachInput } from './sim/input.js'
import { createBot, botStep } from './sim/bot.js'
import { cameraFor, cameraTarget } from './sim/camera.js'
import './runner.css'

const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const DONE_DELAY = 1400 // ms of celebration before the level-complete panel
const OVER_DELAY = 600 // ms between the impact and the game-over panel / restart being available
const FLAT_WORLD = { height: () => 0 } // MountainMassif only needs a ground height
const SUN = new Vector3(-0.42, 0.36, 0.83).normalize()
const SUN_POSITION = SUN.clone().multiplyScalar(60).toArray()

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
function Loop({ sim, onPhase, onScore, onOrbs, debug }) {
  const gl = useThree((st) => st.gl)
  const scene = useThree((st) => st.scene)
  const cam = useThree((st) => st.camera)
  useEffect(() => { if (debug) { debug.gl = gl; debug.scene = scene; debug.camera = cam } }, [gl, scene, cam, debug])
  const last = useRef({ phase: '', score: -1, orbs: -1, paused: false })
  const pos = useRef(new Vector3(0, 2.7, 5.6))
  const look = useRef(new Vector3(0, 0.6, -9))
  const tgt = useMemo(() => ({}), [])
  const first = useRef(true)

  useFrame(({ camera, size }, rawDt) => {
    const s = sim.current
    const dt = Math.min(rawDt, 0.05)
    const t0 = debug ? performance.now() : 0
    update(s, rawDt)
    s.events.length = 0 // nothing consumes frame events yet; keep the queue from growing
    if (debug) { debug.frames = (debug.frames ?? 0) + 1; const ms = performance.now() - t0; debug.simMs = (debug.simMs ?? ms) * 0.95 + ms * 0.05 }

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
    // a very short, small shake on impact (skipped for reduced motion)
    if (s.phase === 'gameover' && s.hitT < 0.22 && !REDUCED_MOTION) {
      const a = 0.07 * (1 - s.hitT / 0.22)
      camera.position.x += Math.sin(s.hitT * 120) * a
      camera.position.y += Math.cos(s.hitT * 97) * a * 0.7
    }
    camera.lookAt(look.current)

    const l = last.current
    if (l.phase !== s.phase || l.paused !== s.paused) { l.phase = s.phase; l.paused = s.paused; onPhase(s.phase, s.paused) }
    const score = Math.floor(s.dist)
    if (score !== l.score && (score - l.score >= 1 || score === 0)) { l.score = score; onScore(score) }
    if (s.orbCount !== l.orbs) { l.orbs = s.orbCount; onOrbs(s.orbCount) }
  })
  return null
}


/** A short burst of ice/snow shards from the point of impact. 40 pooled points, only alive for ~0.8 s after a hit. */
const SHARDS = 40
function HitBurst({ sim }) {
  const { geo, vel, mat } = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(SHARDS * 3), 3))
    const vel = new Float32Array(SHARDS * 3)
    const mat = new PointsMaterial({ size: 0.2, color: '#e6f6ff', transparent: true, opacity: 0, depthWrite: false })
    return { geo, vel, mat }
  }, [])
  const armed = useRef(false)
  useFrame(() => {
    const s = sim.current
    const p = geo.attributes.position.array
    if (s.phase !== 'gameover' || !s.hit) { armed.current = false; mat.opacity = 0; return }
    if (!armed.current) {
      armed.current = true
      const z = -aheadOf(s, s.hit)
      for (let i = 0; i < SHARDS; i++) {
        p[i * 3] = s.x + (Math.random() - 0.5) * 0.8; p[i * 3 + 1] = 0.4 + Math.random() * 1.2; p[i * 3 + 2] = z + 0.4
        vel[i * 3] = (Math.random() - 0.5) * 6; vel[i * 3 + 1] = 2 + Math.random() * 4; vel[i * 3 + 2] = 1 + Math.random() * 4
      }
    }
    const t = s.hitT
    const dt = 1 / 60
    for (let i = 0; i < SHARDS; i++) {
      vel[i * 3 + 1] -= 14 * dt
      p[i * 3] += vel[i * 3] * dt; p[i * 3 + 1] = Math.max(0.02, p[i * 3 + 1] + vel[i * 3 + 1] * dt); p[i * 3 + 2] += vel[i * 3 + 2] * dt
    }
    geo.attributes.position.needsUpdate = true
    mat.opacity = Math.max(0, 1 - t / 0.9)
  })
  return <points geometry={geo} material={mat} frustumCulled={false} />
}

function Scene({ sim, quality, world, onPhase, onScore, onOrbs, debug }) {
  const t = world.runner // this world's theme: src/worlds/runnerThemes.js (World 01 = the original look)
  return (
    <>
      <color attach="background" args={[t.fog.color]} />
      <fog attach="fog" args={[t.fog.color, t.fog.near, t.fog.far]} />
      <hemisphereLight args={[t.light.hemiSky, t.light.hemiGround, t.light.hemiIntensity]} />
      <ambientLight intensity={t.light.ambientIntensity} color={t.light.ambient} />
      <directionalLight position={SUN_POSITION} color={t.light.sun} intensity={t.light.sunIntensity} />
      <Loop sim={sim} onPhase={onPhase} onScore={onScore} onOrbs={onOrbs} debug={debug} />
      <Sky colors={t.sky} />
      <Ground sim={sim} theme={t} />
      <Obstacles sim={sim} />
      <FinishGate sim={sim} />
      <Shadow sim={sim} />
      <HitBurst sim={sim} />
      <Snowfall count={t.snow.count[quality] ?? t.snow.count.high} paused={false} color={t.snow.color} />
      <Suspense fallback={null}>
        <RunnerForest sim={sim} quality={quality} />
        <RunnerAisha sim={sim} debug={debug} />
        <Orbs sim={sim} />
        {t.hazards?.wolf && <Wolves sim={sim} />}
        <Ready />
      </Suspense>
      <Suspense fallback={null}>
        {t.backdrop ? <Backdrop url={world.background} crop={t.backdrop.crop} /> : <MountainMassif world={FLAT_WORLD} />}
      </Suspense>
    </>
  )
}

let readyCb = () => {}
function Ready() {
  useEffect(() => { readyCb() }, [])
  return null
}

function Stars({ n, big }) {
  return (
    <span className={big ? 'stars stars-big' : 'stars'} aria-hidden="true">
      {[1, 2, 3].map((i) => <b key={i} className={i <= n ? 'on' : ''}>★</b>)}
    </span>
  )
}

export default function RunnerGame() {
  const sim = useRef(null)
  const [progress, setProgress] = useState(() => loadProgress()) // saved per-world bests and stars (progress.js)
  const [world, setWorld] = useState(() => pickWorld(window.location.search, progress))
  const unlockAll = useMemo(() => unlockAllRequested(), [])
  const [screen, setScreen] = useState('start') // 'start' | 'worlds' (the world-select screen)
  if (!sim.current) { sim.current = createSim(1, world.runner); sim.current.phase = 'ready'; sim.current.anim = 'idle' }
  const [phase, setPhase] = useState('ready')
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [orbs, setOrbs] = useState(0)
  const [outcome, setOutcome] = useState(null) // {completed, stars, distance, orbs, seen} of the run that just ended
  const [auto, setAuto] = useState(false) // Auto play: watch-only, the bot drives
  const autoTimer = useRef(0)
  const screenRef = useRef('start')
  useEffect(() => { screenRef.current = screen }, [screen])
  const bot = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [quality] = useState(detectQuality)
  const root = useRef(null)
  const debug = useMemo(() => (new URLSearchParams(window.location.search).has('debug') ? {} : null), [])
  const hitAt = useRef(0)
  const [showOver, setShowOver] = useState(false)
  const saved = progress.worlds[world.id] ?? { best: 0, bestOrbs: 0, stars: 0, completed: false }
  const finish = world.runner.finishDistance
  const overTimer = useRef(0)

  useEffect(() => { readyCb = () => setLoaded(true); return () => { readyCb = () => {} } }, [])

  const start = useCallback(() => {
    const s = sim.current
    if (s.phase === 'running') return
    if ((s.phase === 'gameover' || s.phase === 'complete') && performance.now() - hitAt.current < (s.phase === 'complete' ? DONE_DELAY : OVER_DELAY)) return // no accidental instant restart (the panel is not up yet)
    clearTimeout(autoTimer.current)
    startRun(s, (Math.random() * 1e9) | 0)
    setAuto(false); setScore(0); setOrbs(0)
  }, [])
  // Auto play: the same game, driven by sim/bot.js through command(); player input is ignored until Stop / Esc.
  const startAuto = useCallback(() => {
    const s = sim.current
    if (s.phase === 'running' && !s.auto) return
    clearTimeout(autoTimer.current)
    bot.current = createBot()
    startRun(s, (Math.random() * 1e9) | 0, { auto: true })
    s.driver = (q) => botStep(q, bot.current)
    setAuto(true); setScore(0); setOrbs(0)
  }, [])
  const exitAuto = useCallback(() => {
    clearTimeout(autoTimer.current)
    const s = sim.current
    resetToReady(s)
    s.auto = false; s.driver = null
    setAuto(false); setScore(0); setOrbs(0)
  }, [])
  // Switch worlds in-page (no reload): the scene re-themes, the sim gets the new world's data, the URL keeps ?world= in sync.
  const selectWorld = useCallback((id) => {
    const w = allWorlds.find((x) => x.id === id)
    if (!w) return false
    const card = describeWorlds(progress, allWorlds, unlockAll).find((c) => c.id === id)
    if (!card || card.locked) return false // locked worlds cannot be selected (?unlock=all lifts this for QA)
    clearTimeout(autoTimer.current)
    const s = sim.current
    s.world = w.runner
    resetToReady(s)
    s.auto = false; s.driver = null
    setAuto(false); setScore(0); setOrbs(0); setOutcome(null); setShowOver(false)
    setWorld(w); setScreen('start')
    try { const u = new URL(window.location.href); u.searchParams.set('world', id); window.history.replaceState(null, '', u) } catch { /* no history API */ }
    return true
  }, [progress, unlockAll])
  const togglePause = useCallback(() => {
    const s = sim.current
    if (s.phase === 'running') s.paused = !s.paused
  }, [])

  const onPhase = useCallback((p, pz) => {
    setPhase(p); setPaused(pz)
    clearTimeout(overTimer.current)
    const s = sim.current
    if ((p === 'gameover' || p === 'complete') && s.auto) {
      // Auto play never touches the saved progress; it just starts another demonstration run after a moment
      autoTimer.current = setTimeout(() => { if (s.auto && (s.phase === 'gameover' || s.phase === 'complete')) startAuto() }, p === 'complete' ? 3500 : 1500)
    } else if (p === 'gameover' || p === 'complete') {
      const done = p === 'complete'
      hitAt.current = performance.now()
      setOutcome({ completed: done, stars: s.stars, distance: Math.floor(s.dist), orbs: s.orbCount, seen: s.orbsSeen, hit: s.hit?.kind })
      setProgress((prev) => { const next = recordRun(prev, world.id, { distance: s.dist, orbs: s.orbCount, completed: done, stars: s.stars }); saveProgress(next); return next })
      overTimer.current = setTimeout(() => setShowOver(true), done ? DONE_DELAY : OVER_DELAY) // let the impact / the celebration play out first
    } else {
      setShowOver(false)
    }
  }, [startAuto, world.id])
  useEffect(() => () => { clearTimeout(overTimer.current); clearTimeout(autoTimer.current) }, [])

  useEffect(() => {
    const el = root.current
    const detach = attachInput(
      el,
      (cmd) => command(sim.current, cmd),
      {
        onKey: (e) => {
          const s = sim.current
          if (s.auto && e.code === 'Escape') { if (!e.repeat) exitAuto(); return true } // Esc leaves Auto play
          if (s.phase === 'ready' && screenRef.current === 'worlds') { if (e.code === 'Escape' && !e.repeat) setScreen('start'); return e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space' } // the world list is a menu: Esc closes it; Enter/Space never start a run behind it
          if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) togglePause(); return true }
          if (s.auto) return false // watch-only: every other key is ignored by command()
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
    document.title = world.id === '01' ? 'Frost — Run' : `Frost — ${world.name}`
    return () => { detach(); document.removeEventListener('visibilitychange', hide); el.removeEventListener('touchmove', prevent) }
  }, [start, togglePause, exitAuto, world.id, world.name])

  useEffect(() => {
    if (debug) window.__frostRunner = { sim: sim.current, command: (c) => command(sim.current, c), start, startAuto, exitAuto, selectWorld, reset: () => resetToReady(sim.current), debug }
  }, [debug, start, startAuto, exitAuto, selectWorld])

  return (
    <div className="runner-root" ref={root} data-phase={phase} data-paused={paused} data-loaded={loaded}>
      <Canvas
        dpr={quality === 'low' ? [1, 1.5] : [1, 2]}
        camera={{ fov: 58, near: 0.1, far: 7000, position: [0, 2.7, 5.6] }}
        gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
      >
        <Scene sim={sim} quality={quality} world={world} onPhase={onPhase} onScore={setScore} onOrbs={setOrbs} debug={debug} />
      </Canvas>

      <div className="runner-hud" aria-live="polite">
        <span className="runner-score">{score} m</span>
        <span className="runner-orbs" aria-label={`${orbs} orbs`}><i aria-hidden="true" />{orbs}</span>
        {saved.best > 0 && !auto && <span className="runner-best">Best {saved.best} m</span>}
        {auto && <span className="runner-auto" data-testid="auto-badge">Auto play</span>}
        {auto && <button className="runner-stop" onClick={exitAuto}>Stop</button>}
        {phase === 'running' && !auto && <button className="runner-pause" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? '▶' : 'Ⅱ'}</button>}
      </div>

      {phase !== 'ready' && !showOver && (
        <div className="runner-progress" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={finish} aria-valuenow={Math.min(score, finish)}>
          <i style={{ width: `${Math.min(100, (score / finish) * 100)}%` }} />
          <span>{finish} m</span>
        </div>
      )}

      {!loaded && <div className="runner-screen"><p className="runner-loading">Loading Frost…</p></div>}

      {loaded && phase === 'ready' && screen === 'start' && (
        <div className="runner-screen" data-screen="start">
          <h1>Frost</h1>
          <p className="runner-tag">Run the snowy trail with Aisha</p>
          <p className="runner-level" data-testid="level-info">{world.name} · {finish} m{saved.stars > 0 && <> · <Stars n={saved.stars} /></>}{saved.best > 0 && saved.stars === 0 && <> · best {saved.best} m</>}</p>
          <button className="runner-btn" onClick={start} autoFocus>Start run</button>
          <button className="runner-btn runner-btn-alt" onClick={startAuto}>Auto play</button>
          <button className="runner-btn runner-btn-alt" onClick={() => setScreen('worlds')}>Worlds</button>
          <p className="runner-hint">Auto play: watch Aisha run by herself</p>
          <ul className="runner-help">
            <li><b>← →</b> / A D · swipe: change lane</li>
            <li><b>↑</b> / W / Space · swipe up: jump</li>
            <li><b>↓</b> / S · swipe down: duck</li>
          </ul>
        </div>
      )}

      {loaded && phase === 'ready' && screen === 'worlds' && (
        <div className="runner-screen runner-select" data-screen="worlds">
          <h2>Choose a world</h2>
          <p className="runner-hint">{describeWorlds(progress, allWorlds, unlockAll).reduce((n, c) => n + c.stars, 0)} / {allWorlds.length * 3} ★ · finish a world to unlock the next</p>
          <ul className="runner-worlds">
            {describeWorlds(progress, allWorlds, unlockAll).map((c) => (
              <li key={c.id}>
                <button
                  className={`runner-card${c.id === world.id ? ' current' : ''}${c.locked ? ' locked' : ''}`}
                  data-world={c.id} disabled={c.locked} aria-disabled={c.locked} onClick={() => selectWorld(c.id)}
                  style={{ '--art': `url(${allWorlds.find((x) => x.id === c.id).background})` }}
                >
                  <span className="runner-card-name">{c.id} · {c.name}</span>
                  <span className="runner-card-meta">
                    {c.locked ? <>🔒 Finish {c.unlockedBy}</> : <>{c.finish} m · <Stars n={c.stars} />{c.best > 0 && <> · best {c.best} m</>}</>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button className="runner-btn runner-btn-alt" onClick={() => setScreen('start')} autoFocus>Back</button>
        </div>
      )}

      {phase === 'running' && paused && (
        <div className="runner-screen" data-screen="paused">
          <h2>Paused</h2>
          <button className="runner-btn" onClick={togglePause}>Resume</button>
        </div>
      )}

      {phase === 'gameover' && <div className="runner-flash" aria-hidden="true" />}
      {phase === 'gameover' && showOver && outcome && (
        <div className="runner-screen runner-over" data-screen="gameover">
          <h2>{outcome.hit === 'wolf' ? 'The wolf got you' : outcome.hit === 'ridge' ? 'You tripped on the fallen pine' : 'You hit the ice'}</h2>
          <p className="runner-label">Distance</p>
          <p className="runner-final">{outcome.distance}<small> m</small></p>
          <p className="runner-tag">of {finish} m · {Math.floor((outcome.distance / finish) * 100)}%</p>
          <p className="runner-orbs-final"><i aria-hidden="true" />{outcome.orbs} {outcome.orbs === 1 ? 'orb' : 'orbs'}{saved.bestOrbs > 0 && outcome.orbs >= saved.bestOrbs ? ' · best!' : ''}</p>
          <p className="runner-tag">{saved.best > 0 && outcome.distance >= saved.best ? 'New best!' : `Best ${saved.best} m`}</p>
          <button className="runner-btn" onClick={start} autoFocus>Restart</button>
          <p className="runner-hint">Enter · Space · R</p>
        </div>
      )}
      {phase === 'complete' && showOver && outcome && (
        <div className="runner-screen runner-over runner-done" data-screen="complete">
          <h2>Level complete</h2>
          <p className="runner-world">{world.name}</p>
          <p className="runner-stars" aria-label={`${outcome.stars} of 3 stars`}><Stars n={outcome.stars} big /></p>
          <p className="runner-orbs-final"><i aria-hidden="true" />{outcome.orbs} / {outcome.seen} orbs</p>
          <p className="runner-tag">{outcome.distance} m · best {saved.stars}★</p>
          <button className="runner-btn" onClick={start} autoFocus>Play again</button>
          {nextWorldId(world.id, worldIds) && <button className="runner-btn runner-btn-alt runner-next" onClick={() => selectWorld(nextWorldId(world.id, worldIds))}>Next world</button>}
          <p className="runner-hint">Enter · Space · R</p>
        </div>
      )}
    </div>
  )
}
