// Frost — Phase 1: three-lane snowy-trail runner with Aisha.
// Sim (sim/sim.js) is pure and fixed-step; this file wires it to the scene,
// camera, input and screens.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESFilmicToneMapping, Color, PointsMaterial, BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace, Vector3 } from 'three'
import { Sky } from '../expedition/scene/Sky.jsx'
import { MountainMassif } from '../expedition/scene/Distant.jsx'
import { assets, useAssetVersion, planFor, THUMBS } from '../assets/index.js'
import { Snowfall } from '../expedition/scene/Atmosphere.jsx'
import { Ground } from './scene/Ground.jsx'
import { Backdrop } from './scene/Backdrop.jsx'
import { FinishGate } from './scene/FinishGate.jsx'
import { Wolves } from './scene/Wolves.jsx'
import { Gusts } from './scene/Gusts.jsx'
import { fogAt } from './sim/mist.js'
import { pickWorld, unlockAllRequested } from './worlds.js'
import { loadProgress, saveProgress, recordRun, recordEndless, endlessOpen, nextWorldId, describeWorlds } from './progress.js'
import { worldIds } from '../worlds/runnerThemes.js'
import { worlds as allWorlds } from '../worlds/config.js'
import { RunnerForest } from './scene/RunnerForest.jsx'
import { slopeFor } from './scene/scenery.js'
import { Obstacles } from './scene/Obstacles.jsx'
import { Orbs } from './scene/Orbs.jsx'
import { RunnerAisha } from './scene/RunnerAisha.jsx'
import { createSim, startRun, resetToReady, update, command, aheadOf } from './sim/sim.js'
import { attachInput } from './sim/input.js'
import { buzz, hapticsSupported } from './feel.js'
import { createAudio } from './audio/engine.js'
import { CHALLENGES, evaluateChallenge, progressLabel } from './challenges.js'
import { nextLocked, nextOutfit, usableOutfit } from './outfits.js'
import { loadSettings, saveSettings, nextChoice, resolveReducedMotion, showHint, showButtons } from './settings.js'
import { TIERS, TIER_DATA, FrameMeter, activeTier, loadTier, nextTierDown, saveTier, snowCount, startTier } from './quality.js'
import { createBot, botStep } from './sim/bot.js'
import { cameraFor, cameraTarget } from './sim/camera.js'
import { bendTable, curveFor, lookShift } from './bend.js'
import { createBend, patchScene } from './scene/bendMaterial.js'
import './runner.css'

const SYSTEM_REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
const PREFETCH_AT = 0.35 // fraction of a level after which the next world's files are fetched in the background
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
function Loop({ sim, bend, spiral, onPhase, onScore, onOrbs, onClose, onJump, haptics, reduceMotion, meter, adaptive, onDowngrade, audio, debug }) {
  const gl = useThree((st) => st.gl)
  const scene = useThree((st) => st.scene)
  const cam = useThree((st) => st.camera)
  useEffect(() => { if (debug) { debug.gl = gl; debug.scene = scene; debug.camera = cam } }, [gl, scene, cam, debug])
  const last = useRef({ phase: '', score: -1, orbs: -1, paused: false })
  const pos = useRef(new Vector3(0, 2.7, 5.6))
  const look = useRef(new Vector3(0, 0.6, -9))
  const tgt = useMemo(() => ({}), [])
  const first = useRef(true)
  const curve = useRef({ key: '', spiral: null, c: null, straight: false })

  useFrame(({ camera, size }, rawDt) => {
    const s = sim.current
    const dt = Math.min(rawDt, 0.05)
    const t0 = debug ? performance.now() : 0
    update(s, rawDt)
    if (s.phase === 'running' && !s.paused) { // frame times feed the quality meter; it only ever lowers the draw cost, never touches the sim
      meter.push(rawDt * 1000)
      if (adaptive.current && meter.verdict() === 'down') onDowngrade()
    }
    for (const e of s.events) { // felt events: a short vibration (not in Auto play, or when switched off) and the 'Close!' pop
      buzz(e, { enabled: haptics.current, auto: s.auto })
      audio.event(e, s) // sound: the same events, never in Auto play or when switched off
      if (e === 'nearMiss') onClose()
      if (e === 'jump' && !s.auto) onJump()
    }
    s.events.length = 0 // keep the queue from growing
    audio.frame(s) // footsteps, hazard warnings and the wind bed follow the run
    if (debug) { debug.frames = (debug.frames ?? 0) + 1; const ms = performance.now() - t0; debug.simMs = (debug.simMs ?? ms) * 0.95 + ms * 0.05 }

    // the spiral trail: the path ahead of the runner for this distance (bend.js), shared with every patched material
    const key = `${reduceMotion.current}|${s.endless}|${s.world?.finishDistance}`
    if (curve.current.key !== key || curve.current.spiral !== spiral) curve.current = { key, spiral, c: curveFor(spiral, { reduce: reduceMotion.current, finish: s.endless ? null : s.world?.finishDistance ?? null }), straight: false }
    if (curve.current.c || !curve.current.straight) { bendTable(curve.current.c, s.dist, bend.table); bend.push(bend.table); curve.current.straight = !curve.current.c }

    const rig = cameraFor(size.width / size.height)
    if (camera.fov !== rig.fov) { camera.fov = rig.fov; camera.updateProjectionMatrix() }
    cameraTarget(rig, s, tgt, curve.current.c ? lookShift(bend.table) : 0)
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
    if (s.phase === 'gameover' && s.hitT < 0.22 && !reduceMotion.current) {
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


/** ?fps: a live readout for measuring on a real device (frame rate, frame times, the tier in use, the screen and its pixel ratio). */
function FpsReadout({ meter, tier }) {
  const [text, setText] = useState('fps …')
  useEffect(() => {
    const id = setInterval(() => {
      const s = meter.stats()
      const c = document.querySelector('.runner-root canvas')
      setText(s.n ? `${s.fps.toFixed(0)} fps · avg ${s.avg.toFixed(1)} ms · p95 ${s.p95.toFixed(1)} ms · tier ${tier} · ${c ? `${c.width}x${c.height}px` : ''} @${window.devicePixelRatio}x` : 'fps … (play to measure)')
    }, 500)
    return () => clearInterval(id)
  }, [meter, tier])
  return <div className="runner-fps" data-testid="fps-readout" aria-hidden="true">{text}</div>
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

/** World 05: the fog closes in and takes a lilac tint while a bank of dream mist passes (sim.mist, see sim/mist.js). */
function MistFog({ sim, theme }) {
  const colors = useMemo(() => ({ base: new Color(theme.fog.color), mist: new Color(theme.mist.color ?? theme.fog.color) }), [theme])
  useFrame(({ scene }) => {
    const t = sim.current.mist
    const r = fogAt(t, theme.fog, theme.mist)
    if (!scene.fog) return
    scene.fog.near = r.near; scene.fog.far = r.far
    scene.fog.color.copy(colors.base).lerp(colors.mist, t * 0.7)
    if (scene.background?.isColor) scene.background.copy(scene.fog.color)
  })
  return null
}

/** Makes everything that belongs to the trail follow the spiral (scene/bendMaterial.js): new materials are patched before they draw. */
function BendPatch({ bend }) {
  const scene = useThree((st) => st.scene)
  const n = useRef(0)
  useFrame(() => { if (n.current++ < 40 || n.current % 6 === 0) patchScene(scene, bend) })
  return null
}

function Scene({ sim, bend, quality, world, endless, outfit, onPhase, onScore, onOrbs, onClose, onJump, haptics, reduceMotion, highContrast, meter, adaptive, onDowngrade, audio, debug }) {
  const t = world.runner // this world's theme: src/worlds/runnerThemes.js (World 01 = the original look)
  useAssetVersion() // re-render when a model or painting finishes (or is released)
  const have = (id) => assets.state(id) === 'ready'
  return (
    <>
      <color attach="background" args={[t.fog.color]} />
      <fog attach="fog" args={[t.fog.color, t.fog.near, t.fog.far]} />
      <hemisphereLight args={[t.light.hemiSky, t.light.hemiGround, t.light.hemiIntensity]} />
      <ambientLight intensity={t.light.ambientIntensity} color={t.light.ambient} />
      <directionalLight position={SUN_POSITION} color={t.light.sun} intensity={t.light.sunIntensity} />
      <Loop sim={sim} bend={bend} spiral={t.spiral} onPhase={onPhase} onScore={onScore} onOrbs={onOrbs} onClose={onClose} onJump={onJump} haptics={haptics} reduceMotion={reduceMotion} meter={meter} adaptive={adaptive} onDowngrade={onDowngrade} audio={audio} debug={debug} />
      {t.mist && <MistFog sim={sim} theme={t} />}
      {t.gust && <Gusts sim={sim} gust={t.gust} />}
      <BendPatch bend={bend} />
      <group userData={{ noBend: true }}><Sky colors={t.sky} /></group>
      <Ground sim={sim} theme={t} />
      <Obstacles sim={sim} highContrast={highContrast} />
      {!endless && <FinishGate sim={sim} />}
      <group userData={{ noBend: true }}><Shadow sim={sim} /></group>
      <HitBurst sim={sim} />
      <group userData={{ noBend: true }}><Snowfall count={snowCount(t, quality)} paused={false} color={t.snow.color} /></group>
      <Ready />
      {/* models and paintings mount only once the asset manager has them decoded (src/assets): the scene around them draws from the first frame */}
      <Suspense fallback={null}>
        {have('spruces') && <RunnerForest sim={sim} quality={quality} slope={slopeFor(t)} />}
        {have('aisha') && <group userData={{ noBend: true }}><RunnerAisha sim={sim} debug={debug} outfit={outfit} /></group>}
        {have('orb') && <Orbs sim={sim} />}
        {t.hazards?.wolf && have('wolf') && <Wolves sim={sim} />}
      </Suspense>
      <Suspense fallback={null}>
        {t.backdrop ? (have(`bg-${world.id}`) && <group userData={{ noBend: true }}><Backdrop id={`bg-${world.id}`} crop={t.backdrop.crop} sim={t.mist ? sim : null} /></group>)
          : (have('massif') && <group userData={{ noBend: true }}><MountainMassif world={FLAT_WORLD} /></group>)}
      </Suspense>
    </>
  )
}

let readyCb = () => {}
function Ready() {
  useEffect(() => { readyCb() }, [])
  return null
}

const PAD = [ // on-screen buttons: lane changes on one side, jump and slide on the other (Left-handed layout swaps the sides in CSS)
  { side: 'move', keys: [{ cmd: 'left', label: 'LEFT', aria: 'Move left' }, { cmd: 'right', label: 'RIGHT', aria: 'Move right' }] },
  { side: 'act', keys: [{ cmd: 'jump', label: 'JUMP', aria: 'Jump' }, { cmd: 'duck', label: 'SLIDE', aria: 'Slide' }] },
]

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
  const [endless, setEndless] = useState(false) // Endless mode: this world's obstacles with no finish line (opens once the world is finished)
  const endlessRef = useRef(false)
  const [close, setClose] = useState(0) // counts 'Close!' pops (a near miss: an obstacle passed within a hand's width)
  const [settings, setSettings] = useState(loadSettings) // player settings (settings.js): vibration, motion, quality, left-handed, high contrast, hint
  const change = useCallback((patch) => setSettings((v) => ({ ...v, ...patch })), [])
  const hapticsRef = useRef(settings.haptics)
  const reduceMotion = resolveReducedMotion(settings, SYSTEM_REDUCED_MOTION)
  const reduceRef = useRef(reduceMotion)
  const difficultyRef = useRef(settings.difficulty)
  const soundRef = useRef(settings.sound)
  useEffect(() => { hapticsRef.current = settings.haptics; reduceRef.current = reduceMotion; difficultyRef.current = settings.difficulty; soundRef.current = settings.sound; saveSettings(settings) }, [settings, reduceMotion])
  const onJump = useCallback(() => change({ hintSeen: true }), [change])
  const onClose = useCallback(() => setClose((n) => n + 1), [])
  const [outcome, setOutcome] = useState(null) // {completed, stars, distance, orbs, seen} of the run that just ended
  const [auto, setAuto] = useState(false) // Auto play: watch-only, the bot drives
  const autoTimer = useRef(0)
  const screenRef = useRef('start')
  useEffect(() => { screenRef.current = screen }, [screen])
  const bot = useRef(null)
  const [loaded, setLoaded] = useState(false) // the canvas is up and the menu can show; the models arrive in the background (assetStatus.ready)
  // Asset loading (src/assets): this world's models/painting load now, the next world's are fetched quietly, the rest is released.
  const plan = useMemo(() => planFor(world.id), [world.id])
  const planRef = useRef(plan)
  // The next world is fetched quietly only once the player is well into this one (or has finished it), so someone who leaves early never pays for it.
  const [warmWorld, setWarmWorld] = useState(null)
  const warm = warmWorld === world.id
  useEffect(() => { planRef.current = plan; assets.plan({ active: plan.active, prefetch: warm ? plan.prefetch : [] }) }, [plan, warm])
  useAssetVersion()
  const assetStatus = assets.status(plan.active)
  const isReady = () => assets.status(planRef.current.active).ready
  // Quality tier: 'auto' starts from what the screen suggests (or lower, if this device was measured to need it) and steps down when
  // frames are slow (quality.js); a manual Graphics choice, or ?tier=high|low|min in the URL, is exact. ?fps shows a live readout.
  const flags = useMemo(() => { const p = new URLSearchParams(window.location.search); const t = p.get('tier'); return { fps: p.has('fps'), tier: TIERS.includes(t) ? t : null, adapt: p.has('adapt'), debug: p.has('debug') } }, [])
  const outfit = useMemo(() => usableOutfit(settings.outfit, progress, unlockAll), [settings.outfit, progress, unlockAll]) // locked outfits fall back to Frost
  const [autoTier, setAutoTier] = useState(() => startTier(detectQuality(), loadTier()))
  const quality = flags.tier ?? activeTier(settings.quality, autoTier)
  const meter = useMemo(() => new FrameMeter(), [])
  const bend = useMemo(() => createBend(), []) // the spiral trail's shared path table (scene/bendMaterial.js)
  const audio = useMemo(() => createAudio(), []) // synthesized sound (audio/engine.js): created in a user gesture, silent in Auto play
  useEffect(() => { audio.setEnabled(settings.sound) }, [audio, settings.sound])
  useEffect(() => { audio.setMusicEnabled(settings.music) }, [audio, settings.music])
  useEffect(() => { audio.setWorld(world.id) }, [audio, world.id]) // the music changes key and tempo with the world
  const adaptive = useRef(false)
  const qualityRef = useRef(quality)
  const adaptiveOn = settings.quality === 'auto' && !flags.tier && nextTierDown(quality) !== null && (!flags.debug || flags.adapt) // nothing lower than min to step to; ?debug runs (tests, measurements) keep their tier unless ?adapt is added
  useEffect(() => { adaptive.current = adaptiveOn; qualityRef.current = quality }, [adaptiveOn, quality])
  const onDowngrade = useCallback(() => { const n = nextTierDown(qualityRef.current); if (n) { setAutoTier(n); saveTier(n) } }, [])
  const glConfig = useMemo(() => ({ antialias: quality === 'high', powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }), []) // eslint-disable-line react-hooks/exhaustive-deps -- antialiasing is fixed when the canvas is created
  const root = useRef(null)
  const debug = useMemo(() => (new URLSearchParams(window.location.search).has('debug') ? {} : null), [])
  useEffect(() => { if (debug) { debug.meter = meter; debug.audio = audio; debug.bend = bend; debug.assets = assets } }, [debug, meter, audio, bend]) // ?debug: tests shorten the meter's window, read the sound counters and the spiral path
  const hitAt = useRef(0)
  const progressRef = useRef(progress)
  useEffect(() => { progressRef.current = progress }, [progress])
  const [showOver, setShowOver] = useState(false)
  const saved = progress.worlds[world.id] ?? { best: 0, bestOrbs: 0, stars: 0, completed: false }
  const finish = world.runner.finishDistance
  useEffect(() => { if (!warm && !endless && !auto && (phase === 'complete' || (phase === 'running' && score >= finish * PREFETCH_AT))) setWarmWorld(world.id) }, [warm, endless, auto, phase, score, finish, world.id])
  const overTimer = useRef(0)

  useEffect(() => { readyCb = () => setLoaded(true); return () => { readyCb = () => {} } }, [])

  const start = useCallback(() => {
    const s = sim.current
    if (s.phase === 'running') return
    if (!isReady()) return // the models are still arriving (the start screen shows the progress)
    if ((s.phase === 'gameover' || s.phase === 'complete') && performance.now() - hitAt.current < (s.phase === 'complete' ? DONE_DELAY : OVER_DELAY)) return // no accidental instant restart (the panel is not up yet)
    clearTimeout(autoTimer.current)
    startRun(s, (Math.random() * 1e9) | 0, { difficulty: difficultyRef.current, endless: endlessRef.current })
    setAuto(false); setScore(0); setOrbs(0); setEndless(endlessRef.current)
  }, [])
  const restart = useCallback(() => { // the in-game Restart button: a fresh run of the same kind, straight away (also from the pause screen)
    const s = sim.current
    if (s.phase !== 'running' || s.auto) return
    clearTimeout(autoTimer.current)
    startRun(s, (Math.random() * 1e9) | 0, { difficulty: difficultyRef.current, endless: endlessRef.current })
    setScore(0); setOrbs(0); setPaused(false)
  }, [])
  const startLevel = useCallback(() => { endlessRef.current = false; start() }, [start])
  const startEndless = useCallback(() => { endlessRef.current = true; start() }, [start])
  const toMenu = useCallback(() => { // back to the start screen from a game-over / level-complete panel
    const s = sim.current
    if (s.phase === 'running') return
    endlessRef.current = false; setEndless(false)
    resetToReady(s)
    s.auto = false; s.driver = null
    setScore(0); setOrbs(0); setOutcome(null); setShowOver(false); setScreen('start')
  }, [])
  // Auto play: the same game, driven by sim/bot.js through command(); player input is ignored until Stop / Esc.
  const startAuto = useCallback(() => {
    const s = sim.current
    if (s.phase === 'running' && !s.auto) return
    if (!isReady()) return
    clearTimeout(autoTimer.current)
    bot.current = createBot()
    startRun(s, (Math.random() * 1e9) | 0, { auto: true, difficulty: difficultyRef.current })
    s.driver = (q) => botStep(q, bot.current)
    endlessRef.current = false; setEndless(false)
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
    meter.reset() // a new world compiles and uploads new things: give it a fresh warm-up
    resetToReady(s)
    s.auto = false; s.driver = null
    setAuto(false); setScore(0); setOrbs(0); setOutcome(null); setShowOver(false)
    setWorld(w); setScreen('start')
    try { const u = new URL(window.location.href); u.searchParams.set('world', id); window.history.replaceState(null, '', u) } catch { /* no history API */ }
    return true
  }, [progress, unlockAll, meter])
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
      const prevEndless = progressRef.current.worlds[world.id]?.bestEndless ?? 0
      const ch = s.endless ? null : evaluateChallenge(world.id, { completed: done, endless: false, orbs: s.orbCount, seen: s.orbsSeen, tally: s.tally })
      const chNew = !!ch?.done && !progressRef.current.worlds[world.id]?.challenge
      setOutcome({ completed: done, stars: s.stars, distance: Math.floor(s.dist), orbs: s.orbCount, seen: s.orbsSeen, hit: s.hit?.kind, endless: s.endless, newBest: s.endless && Math.floor(s.dist) > prevEndless, challenge: ch, challengeNew: chNew })
      setProgress((prev) => { const next = s.endless ? recordEndless(prev, world.id, { distance: s.dist }) : recordRun(prev, world.id, { distance: s.dist, orbs: s.orbCount, completed: done, stars: s.stars, challenge: ch?.done === true }); saveProgress(next); return next })
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
          if (s.phase === 'ready' && (screenRef.current === 'worlds' || screenRef.current === 'settings')) { if (e.code === 'Escape' && !e.repeat) setScreen('start'); return e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space' } // the world list is a menu: Esc closes it; Enter/Space never start a run behind it
          if (e.code === 'KeyM') { if (!e.repeat) change({ sound: !soundRef.current }); return true } // M mutes / unmutes
          if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) togglePause(); return true }
          if (s.auto) return false // watch-only: every other key is ignored by command()
          if (s.phase !== 'running' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) { if (!e.repeat) start(); return true }
          if (s.phase === 'running' && s.paused && e.code === 'Enter') { if (!e.repeat) togglePause(); return true }
          return false
        },
      },
    )
    const hide = () => { if (document.hidden) { audio.suspend(); if (sim.current.phase === 'running') sim.current.paused = true } else audio.resume() }
    const unlockAudio = () => audio.unlock() // browsers only start sound inside a tap or key press
    document.addEventListener('pointerdown', unlockAudio, true); document.addEventListener('keydown', unlockAudio, true)
    document.addEventListener('visibilitychange', hide)
    const prevent = (e) => e.preventDefault()
    el.addEventListener('touchmove', prevent, { passive: false })
    document.title = world.id === '01' ? 'Frost — Run' : `Frost — ${world.name}`
    return () => { detach(); document.removeEventListener('visibilitychange', hide); document.removeEventListener('pointerdown', unlockAudio, true); document.removeEventListener('keydown', unlockAudio, true); el.removeEventListener('touchmove', prevent) }
  }, [start, togglePause, exitAuto, world.id, world.name, audio])

  useEffect(() => {
    if (debug) window.__frostRunner = { sim: sim.current, command: (c) => command(sim.current, c), start, startAuto, exitAuto, selectWorld, reset: () => resetToReady(sim.current), debug }
  }, [debug, start, startAuto, exitAuto, selectWorld])

  return (
    <div className="runner-root" ref={root} data-phase={phase} data-paused={paused} data-loaded={loaded} data-ready={assetStatus.ready} data-reduce-motion={reduceMotion} data-left-handed={settings.leftHanded} data-high-contrast={settings.highContrast} data-tier={quality}>
      <Canvas
        dpr={(TIER_DATA[quality] ?? TIER_DATA.high).dpr}
        camera={{ fov: 58, near: 0.1, far: 7000, position: [0, 2.7, 5.6] }}
        gl={glConfig}
      >
        <Scene sim={sim} bend={bend} quality={quality} world={world} endless={endless} outfit={outfit} meter={meter} adaptive={adaptive} onDowngrade={onDowngrade} audio={audio} onPhase={onPhase} onScore={setScore} onOrbs={setOrbs} onClose={onClose} onJump={onJump} haptics={hapticsRef} reduceMotion={reduceRef} highContrast={settings.highContrast} debug={debug} />
      </Canvas>

      {close > 0 && phase === 'running' && <span key={close} className="runner-close" aria-hidden="true" data-testid="close-call">Close!</span>}
      <div className="runner-hud" aria-live="polite">
        <span className="runner-score">{score} m</span>
        <span className="runner-orbs" aria-label={`${orbs} orbs`}><i aria-hidden="true" />{orbs}</span>
        {saved.best > 0 && !auto && <span className="runner-best">Best {saved.best} m</span>}
        {auto && <span className="runner-auto" data-testid="auto-badge">Auto play</span>}
        {auto && <button className="runner-stop" onClick={exitAuto}>Stop</button>}
        {saved.stars > 0 && !auto && <span className="runner-hud-stars" data-testid="hud-stars" aria-label={`best ${saved.stars} of 3 stars`}><Stars n={saved.stars} /></span>}
        {phase === 'running' && !auto && (
          <span className="runner-hud-btns">
            <button className="runner-restart" onClick={restart} aria-label="Restart" data-testid="restart-btn">↻</button>
            <button className="runner-pause" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? '▶' : 'Ⅱ'}</button>
          </span>
        )}
      </div>
      {phase === 'running' && !paused && !auto && showButtons(settings, COARSE_POINTER) && (
        <div className="runner-pad" data-testid="pad" role="group" aria-label="Controls">
          {PAD.map((g) => (
            <span key={g.side} className={`runner-pad-${g.side}`}>
              {g.keys.map((k) => (
                <button key={k.cmd} className="runner-key" data-cmd={k.cmd} aria-label={k.aria}
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); command(sim.current, k.cmd) }}
                  onPointerUp={(e) => e.stopPropagation()}>{k.label}</button>
              ))}
            </span>
          ))}
        </div>
      )}

      {phase !== 'ready' && !showOver && endless && !auto && <span className="runner-mode" data-testid="endless-badge">Endless</span>}
      {phase !== 'ready' && !showOver && !endless && (
        <div className="runner-progress" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={finish} aria-valuenow={Math.min(score, finish)}>
          <i style={{ width: `${Math.min(100, (score / finish) * 100)}%` }} />
          <span>{finish} m</span>
        </div>
      )}

      {flags.fps && <FpsReadout meter={meter} tier={quality} />}

      {!loaded && <div className="runner-screen"><p className="runner-loading">Loading Frost…</p></div>}

      {loaded && phase === 'ready' && screen === 'start' && (
        <div className="runner-screen" data-screen="start">
          <h1>Frost</h1>
          <p className="runner-tag">Run the snowy trail with Aisha</p>
          <p className="runner-level" data-testid="level-info">{world.name} · {finish} m{settings.difficulty !== 'normal' && <> · {settings.difficulty}</>}{saved.stars > 0 && <> · <Stars n={saved.stars} /></>}{saved.best > 0 && saved.stars === 0 && <> · best {saved.best} m</>}</p>
          <button className="runner-btn" onClick={startLevel} autoFocus disabled={!assetStatus.ready}>Start run</button>
          {endlessOpen(progress, world.id, unlockAll) && <button className="runner-btn runner-btn-alt" onClick={startEndless} data-testid="endless-start" disabled={!assetStatus.ready}>Endless{saved.bestEndless > 0 ? ` · best ${saved.bestEndless} m` : ''}</button>}
          <button className="runner-btn runner-btn-alt" onClick={startAuto} disabled={!assetStatus.ready}>Auto play</button>
          <button className="runner-btn runner-btn-alt" onClick={() => setScreen('worlds')}>Worlds</button>
          <button className="runner-btn runner-btn-alt" onClick={() => setScreen('settings')}>Settings</button>
          {!assetStatus.ready && (
            <div className="runner-load" data-testid="load-status" role="status">
              {assetStatus.failedRequired.length > 0
                ? <><span>Could not load the game files. Check your connection.</span><button className="runner-btn runner-btn-alt" onClick={() => { assets.retry() }} data-testid="load-retry">Retry</button></>
                : <><span>Loading {Math.round(assetStatus.fraction * 100)}% · {(assetStatus.loaded / 1048576).toFixed(1)} of {(assetStatus.total / 1048576).toFixed(1)} MB</span><i style={{ width: `${Math.round(assetStatus.fraction * 100)}%` }} /></>}
            </div>
          )}
          {assetStatus.ready && assetStatus.failed.length > 0 && <p className="runner-hint" data-testid="load-degraded">The painted horizon did not load. <button className="runner-link" onClick={() => { assets.retry() }}>Retry</button></p>}
          {assetStatus.ready && <p className="runner-hint">Auto play: watch Aisha run by herself</p>}
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
                  style={{ '--art': `url(${THUMBS[c.id].url})` }}
                >
                  <span className="runner-card-name">{c.id} · {c.name}</span>
                  <span className="runner-card-meta">
                    {c.locked ? <>🔒 Finish {c.unlockedBy}</> : <>{c.finish} m · <Stars n={c.stars} />{c.best > 0 && <> · best {c.best} m</>}</>}
                  </span>
                  {!c.locked && CHALLENGES[c.id] && <span className="runner-card-ch" data-done={c.challenge}>{c.challenge ? '◆' : '◇'} {CHALLENGES[c.id].text}</span>}
                </button>
              </li>
            ))}
          </ul>
          <button className="runner-btn runner-btn-alt" onClick={() => setScreen('start')} autoFocus>Back</button>
        </div>
      )}

      {loaded && phase === 'ready' && screen === 'settings' && (
        <div className="runner-screen" data-screen="settings">
          <h2>Settings</h2>
          <ul className="runner-settings">
            {hapticsSupported() && <li><button className="runner-btn runner-btn-alt" role="switch" aria-checked={settings.haptics} onClick={() => change({ haptics: !settings.haptics })}>Vibration: {settings.haptics ? 'on' : 'off'}</button></li>}
            {audio.supported && <li><button className="runner-btn runner-btn-alt" role="switch" aria-checked={settings.music} data-testid="music-switch" onClick={() => change({ music: !settings.music })}>Music: {settings.music ? 'on' : 'off'}</button></li>}
            {audio.supported && <li><button className="runner-btn runner-btn-alt" role="switch" aria-checked={settings.sound} data-testid="sound-switch" onClick={() => change({ sound: !settings.sound })}>Sound: {settings.sound ? 'on' : 'off'}</button></li>}
            <li><button className="runner-btn runner-btn-alt" data-testid="outfit" onClick={() => change({ outfit: nextOutfit(outfit.id, progress, unlockAll).id })} title={nextLocked(progress, unlockAll) ? `Next outfit: ${nextLocked(progress, unlockAll).outfit.name} at ${nextLocked(progress, unlockAll).text}` : 'All outfits unlocked'}>Outfit: {outfit.name}{nextLocked(progress, unlockAll) ? ` · next: ${nextLocked(progress, unlockAll).text.replace(/ \(you have \d+\)/, '')}` : ''}</button></li>
            <li><button className="runner-btn runner-btn-alt" data-testid="difficulty" onClick={() => change({ difficulty: nextChoice('difficulty', settings.difficulty) })}>Difficulty: {settings.difficulty}</button></li>
            <li><button className="runner-btn runner-btn-alt" onClick={() => change({ motion: nextChoice('motion', settings.motion) })}>Reduce motion: {settings.motion}</button></li>
            <li><button className="runner-btn runner-btn-alt" onClick={() => change({ quality: nextChoice('quality', settings.quality) })}>Graphics: {settings.quality}{settings.quality === 'auto' ? ` (${quality})` : ''}</button></li>
            <li><button className="runner-btn runner-btn-alt" data-testid="buttons-setting" onClick={() => change({ buttons: nextChoice('buttons', settings.buttons) })}>On-screen buttons: {settings.buttons}{settings.buttons === 'auto' ? ` (${showButtons(settings, COARSE_POINTER) ? 'on' : 'off'})` : ''}</button></li>
            <li><button className="runner-btn runner-btn-alt" role="switch" aria-checked={settings.leftHanded} onClick={() => change({ leftHanded: !settings.leftHanded })}>Left-handed layout: {settings.leftHanded ? 'on' : 'off'}</button></li>
            <li><button className="runner-btn runner-btn-alt" role="switch" aria-checked={settings.highContrast} onClick={() => change({ highContrast: !settings.highContrast })}>High-contrast obstacles: {settings.highContrast ? 'on' : 'off'}</button></li>
          </ul>
          <button className="runner-btn" onClick={() => setScreen('start')} autoFocus>Back</button>
        </div>
      )}

      {showHint(settings, { auto, phase, dist: score }) && !paused && (
        <p className="runner-tip" role="status" data-testid="first-run-hint">Swipe or use the arrow keys · ← → change lane · ↑ jump · ↓ duck</p>
      )}

      {phase === 'running' && paused && (
        <div className="runner-screen" data-screen="paused">
          <h2>Paused</h2>
          <button className="runner-btn" onClick={togglePause}>Resume</button>
          <button className="runner-btn runner-btn-alt" onClick={restart} data-testid="pause-restart">Restart</button>
        </div>
      )}

      {phase === 'gameover' && <div className="runner-flash" aria-hidden="true" />}
      {phase === 'gameover' && showOver && outcome && (
        <div className="runner-screen runner-over" data-screen="gameover">
          <h2>{outcome.hit === 'wolf' ? 'The wolf got you' : outcome.hit === 'shard' ? 'Crushed by a crystal' : outcome.hit === 'hole' ? 'You fell through the ice' : outcome.hit === 'ridge' ? 'You tripped on the fallen pine' : 'You hit the ice'}</h2>
          <p className="runner-label">Distance</p>
          <p className="runner-final">{outcome.distance}<small> m</small></p>
          <p className="runner-tag">{outcome.endless ? 'Endless run' : `of ${finish} m · ${Math.floor((outcome.distance / finish) * 100)}%`}</p>
          <p className="runner-orbs-final"><i aria-hidden="true" />{outcome.orbs} {outcome.orbs === 1 ? 'orb' : 'orbs'}{!outcome.endless && saved.bestOrbs > 0 && outcome.orbs >= saved.bestOrbs ? ' · best!' : ''}</p>
          <p className="runner-tag">{outcome.endless ? (outcome.newBest ? 'New best!' : `Best ${saved.bestEndless ?? 0} m`) : (saved.best > 0 && outcome.distance >= saved.best ? 'New best!' : `Best ${saved.best} m`)}</p>
          <button className="runner-btn" onClick={start} autoFocus>Restart</button>
          <button className="runner-btn runner-btn-alt runner-menu" onClick={toMenu}>Menu</button>
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
          {outcome.challenge && <p className="runner-tag runner-challenge" data-testid="challenge-result" data-done={outcome.challenge.done}>{outcome.challenge.done ? '◆' : '◇'} {outcome.challenge.text} · {outcome.challenge.done ? (outcome.challengeNew ? 'done!' : 'done') : progressLabel(outcome.challenge)}</p>}
          <button className="runner-btn" onClick={startLevel} autoFocus>Play again</button>
          <button className="runner-btn runner-btn-alt runner-menu" onClick={toMenu}>Menu</button>
          {nextWorldId(world.id, worldIds) && <button className="runner-btn runner-btn-alt runner-next" onClick={() => selectWorld(nextWorldId(world.id, worldIds))}>Next world</button>}
          <p className="runner-hint">Enter · Space · R</p>
        </div>
      )}
    </div>
  )
}
