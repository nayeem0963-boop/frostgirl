// The runner's sound engine (6.2): plays the recipes from sounds.js with Web Audio. Everything is synthesized at run time, so there is
// nothing to download and it works offline. The AudioContext is only created inside a user gesture (browsers refuse to start audio
// before one) and is suspended while the tab is hidden. Sound is off for Auto play (watch-only) and when the player turned it off.
// `AudioContext` can be injected, which is how the tests drive it with a fake.
import { LANES } from '../config.js'
import { ComboTracker, LEVEL, RECIPES, ambientFor, cueDue, orbRecipe, panFor, stepRecipe, stepsBetween } from './sounds.js'

export const MAX_VOICES = 14 // sounds playing at once; more are dropped (the crash always gets through)
export const MASTER_GAIN = 0.9
const MAX_STEPS_PER_FRAME = 3

export function createAudio({ AudioContext: Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? window.webkitAudioContext) : undefined, random = Math.random } = {}) {
  let ctx = null, master = null, noiseBuf = null, windGain = null, windFilter = null
  let enabled = true
  let voices = 0
  let prevDist = 0
  const combo = new ComboTracker()
  const cued = new Set()
  const stats = { played: {}, dropped: 0, voices: 0 }

  const ready = () => !!ctx && ctx.state !== 'closed'

  function makeNoise() {
    const len = ctx.sampleRate * 1
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = random() * 2 - 1
    return buf
  }

  /** Create the audio context. Call it from a user gesture (a tap or a key press): that is what lets the browser start sound. */
  function unlock() {
    if (!Ctor) return false
    if (!ctx) {
      try {
        ctx = new Ctor()
        master = ctx.createGain(); master.gain.value = MASTER_GAIN
        const comp = ctx.createDynamicsCompressor?.()
        if (comp) { // a gentle limiter on the sum: a crash on top of chimes and footsteps must not distort
          comp.threshold.value = -8; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2
          master.connect(comp); comp.connect(ctx.destination)
        } else master.connect(ctx.destination)
        noiseBuf = makeNoise()
      } catch { ctx = null; return false }
    }
    if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {})
    return true
  }

  function startWind() {
    if (windGain || !ready()) return
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 600
    windGain = ctx.createGain(); windGain.gain.value = 0
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master)
    src.start()
  }

  function layer(l, t0, pan, gainMul, last) {
    const g = ctx.createGain()
    const attack = l.swell ? l.dur * l.swell : 0.008
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(Math.max(0.0001, l.gain * gainMul), t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + l.dur)
    let src, chain = g
    if (l.kind === 'tone') {
      src = ctx.createOscillator(); src.type = l.type
      src.frequency.setValueAtTime(l.f0, t0)
      if (l.f1 !== l.f0) src.frequency.exponentialRampToValueAtTime(l.f1, t0 + l.dur)
      let head = src
      if (l.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = l.lowpass; head.connect(f); head = f }
      if (l.tremolo) { // a slow wobble on the level: the growl's rumble
        const lfo = ctx.createOscillator(), depth = ctx.createGain()
        lfo.frequency.value = l.tremolo; depth.gain.value = l.gain * gainMul * 0.5
        lfo.connect(depth); depth.connect(g.gain); lfo.start(t0); lfo.stop(t0 + l.dur + 0.05)
      }
      head.connect(g)
      src.start(t0); src.stop(t0 + l.dur + 0.05)
    } else {
      src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true
      const f = ctx.createBiquadFilter(); f.type = l.filter
      f.frequency.setValueAtTime(l.f0, t0)
      if (l.f1 !== l.f0) f.frequency.exponentialRampToValueAtTime(l.f1, t0 + l.dur)
      f.Q.value = l.q ?? 1
      src.connect(f); f.connect(g)
      src.start(t0, random() * 0.5); src.stop(t0 + l.dur + 0.05)
    }
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; chain.connect(p); p.connect(master) } else chain.connect(master)
    if (last) src.onended = () => { voices = Math.max(0, voices - 1); stats.voices = voices }
  }

  /** Play a recipe (a list of layers). Returns whether it was scheduled. */
  function play(name, layers, { pan = 0, gain = 1, priority = false } = {}) {
    if (!enabled || !ready() || ctx.state === 'suspended') return false
    if (voices >= MAX_VOICES && !priority) { stats.dropped++; return false }
    const t0 = ctx.currentTime + 0.005
    voices++; stats.voices = voices
    const end = layers.reduce((m, l, i) => (l.delay + l.dur >= layers[m].delay + layers[m].dur ? i : m), 0)
    layers.forEach((l, i) => layer(l, t0 + l.delay, pan, gain * (LEVEL[name] ?? 1), i === end))
    stats.played[name] = (stats.played[name] ?? 0) + 1
    return true
  }

  const audible = (sim) => enabled && ready() && !sim.auto

  /** A simulation event: jump, land, lane, duck, orb, nearMiss, gust, hit, complete, start. */
  function event(name, sim) {
    if (!audible(sim)) return false
    const dir = Math.sign((LANES[sim.lane] ?? 0) - (sim.laneFrom ?? 0))
    switch (name) {
      case 'orb': return play('orb', orbRecipe(combo.hit(sim.time)), { pan: panFor('orb', { x: sim.x }), gain: 0.9 })
      case 'lane': case 'gust': return play(name, RECIPES[name], { pan: panFor(name, { dir }) })
      case 'hit': return play('hit', RECIPES.hit, { priority: true })
      case 'complete': return play('complete', RECIPES.complete, { priority: true })
      case 'jump': case 'land': case 'duck': case 'nearMiss': case 'start': return play(name, RECIPES[name], { pan: panFor(name, { x: sim.x }) })
      default: return false
    }
  }

  /** Every frame: footsteps (distance-driven), hazard warnings, and the wind bed. */
  function frame(sim) {
    if (!ready()) return
    const running = sim.phase === 'running' && !sim.paused
    if (!enabled || sim.auto) { if (windGain) windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); prevDist = sim.dist; return }
    if (!windGain) startWind()
    const amb = ambientFor({ running, mist: sim.mist ?? 0, speed: sim.speed })
    windGain.gain.setTargetAtTime(amb.gain, ctx.currentTime, 0.4)
    windFilter.frequency.setTargetAtTime(amb.cutoff, ctx.currentTime, 0.5)
    if (sim.dist < prevDist) { prevDist = sim.dist; cued.clear(); combo.reset() } // a new run
    if (!running) { prevDist = sim.dist; return }
    if (sim.grounded) {
      const { count, startRight } = stepsBetween(prevDist, sim.dist)
      for (let i = 0; i < Math.min(count, MAX_STEPS_PER_FRAME); i++) play('step', stepRecipe(startRight !== (i % 2 === 1)), { pan: panFor('step', { x: sim.x }), gain: 0.8 + random() * 0.4 })
    }
    prevDist = sim.dist
    for (const o of sim.obstacles) {
      if (!o.active || cued.has(o.id)) continue
      const ahead = o.dist - sim.dist
      if (cueDue(o.kind, ahead)) { cued.add(o.id); play(o.kind, RECIPES[o.kind], { pan: panFor(o.kind, { x: o.x }) }) }
    }
    if (cued.size > 64) for (const id of cued) if (!sim.obstacles.some((o) => o.active && o.id === id)) cued.delete(id)
  }

  return {
    unlock,
    event,
    frame,
    setEnabled(v) { enabled = !!v; if (!enabled && windGain && ready()) windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1) },
    suspend() { if (ready() && ctx.state === 'running') ctx.suspend?.()?.catch?.(() => {}) },
    resume() { if (ready() && ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {}) },
    get supported() { return !!Ctor },
    get started() { return ready() },
    stats,
  }
}
