// The runner's sound engine (6.2): plays the recipes from sounds.js with Web Audio. Everything is synthesized at run time, so there is
// nothing to download and it works offline. The AudioContext is only created inside a user gesture (browsers refuse to start audio
// before one) and is suspended while the tab is hidden. Sound is off for Auto play (watch-only) and when the player turned it off.
// `AudioContext` can be injected, which is how the tests drive it with a fake.
import { LANES } from '../config.js'
import { ComboTracker, LEVEL, RECIPES, ambientFor, cueDue, orbRecipe, panFor, stepRecipe, stepsBetween } from './sounds.js'
import { composeBar, barSeconds, musicCutoff, musicTarget } from './music.js'

export const MAX_VOICES = 14 // sounds playing at once; more are dropped (the crash always gets through)
export const MASTER_GAIN = 0.9
export const MUSIC_GAIN = 0.4 // the music bus at full level (before the master): well under the effects, so a crash always stands out
export const MUSIC_VOICES = 16 // music notes sounding at once (separate from the effects' limit, so music never starves them)
const LOOKAHEAD = 0.8 // seconds of music scheduled ahead
const MAX_STEPS_PER_FRAME = 3

export function createAudio({ AudioContext: Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? window.webkitAudioContext) : undefined, random = Math.random } = {}) {
  let ctx = null, master = null, noiseBuf = null, windGain = null, windFilter = null
  let enabled = true
  let musicEnabled = true
  let musicBus = null, musicFilter = null, musicWorld = '01'
  let nextBar = 0, barIndex = 0, musicVoices = 0, duckUntil = 0
  const musicSeed = Math.floor(random() * 1e6) + 1
  let voices = 0
  let prevDist = 0
  const combo = new ComboTracker()
  const cued = new Set()
  const stats = { played: {}, dropped: 0, voices: 0, music: { bars: 0, notes: 0, dropped: 0, world: '01' } }

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
          comp.threshold.value = -8; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2 // unchanged since 6.2: a harder limiter also adds automatic makeup gain and would make every effect louder
          master.connect(comp); softClip(comp)
        } else { master.connect(ctx.destination) }
        noiseBuf = makeNoise()
        buildMusicBus()
      } catch { ctx = null; return false }
    }
    if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {})
    return true
  }

  /**
   * The last stage before the speakers: a soft clipper. The browser's compressor is not a true limiter (a crash landing together with chimes
   * after a quiet moment overshot it to 1.34 in an offline render), so this guarantees the output never exceeds 0.83 of full scale. Small signals
   * pass through at unity gain; only big peaks are rounded off (about -14% at 0.6, -42% at 1.3).
   */
  function softClip(from) {
    if (!ctx.createWaveShaper) { from.connect(ctx.destination); return }
    const pre = ctx.createGain(), post = ctx.createGain(), shaper = ctx.createWaveShaper()
    pre.gain.value = 0.4; post.gain.value = 1 / 1.2
    const n = 2049, curve = new Float32Array(n)
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(3 * x) / Math.tanh(3) }
    shaper.curve = curve; shaper.oversample = '2x'
    from.connect(pre); pre.connect(shaper); shaper.connect(post); post.connect(ctx.destination)
  }

  /** The music's own bus: a low-pass (mist muffles it), the level control, and a soft echo for space. */
  function buildMusicBus() {
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 3800
    musicBus = ctx.createGain(); musicBus.gain.value = 0
    musicFilter.connect(musicBus); musicBus.connect(master)
    if (ctx.createDelay) {
      const delay = ctx.createDelay(2), feedback = ctx.createGain(), wet = ctx.createGain()
      delay.delayTime.value = 0.42; feedback.gain.value = 0.32; wet.gain.value = 0.22
      musicBus.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(master)
    }
  }

  function startWind() {
    if (windGain || !ready()) return
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 600
    windGain = ctx.createGain(); windGain.gain.value = 0
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(master)
    src.start()
  }

  function layer(l, t0, pan, gainMul, onEnd, dest = master) {
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
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; chain.connect(p); p.connect(dest) } else chain.connect(dest)
    if (onEnd) src.onended = onEnd
  }

  /** Play a recipe (a list of layers). Returns whether it was scheduled. */
  function play(name, layers, { pan = 0, gain = 1, priority = false } = {}) {
    if (!enabled || !ready() || ctx.state === 'suspended') return false
    if (voices >= MAX_VOICES && !priority) { stats.dropped++; return false }
    const t0 = ctx.currentTime + 0.005
    voices++; stats.voices = voices
    const end = layers.reduce((m, l, i) => (l.delay + l.dur >= layers[m].delay + layers[m].dur ? i : m), 0)
    const freeVoice = () => { voices = Math.max(0, voices - 1); stats.voices = voices }
    layers.forEach((l, i) => layer(l, t0 + l.delay, pan, gain * (LEVEL[name] ?? 1), i === end ? freeVoice : null))
    stats.played[name] = (stats.played[name] ?? 0) + 1
    return true
  }

  const audible = (sim) => enabled && ready() && !sim.auto
  /** A crash or a level chime briefly pulls the music down so the moment is heard clearly. */
  function duckMusic(seconds) { if (musicBus) { const t = ctx.currentTime; musicBus.gain.cancelScheduledValues?.(t); musicBus.gain.setTargetAtTime(0.05, t, 0.03); duckUntil = t + seconds } }

  /** A simulation event: jump, land, lane, duck, orb, nearMiss, gust, hit, complete, start. */
  function event(name, sim) {
    if (!audible(sim)) return false
    const dir = Math.sign((LANES[sim.lane] ?? 0) - (sim.laneFrom ?? 0))
    switch (name) {
      case 'orb': return play('orb', orbRecipe(combo.hit(sim.time)), { pan: panFor('orb', { x: sim.x }), gain: 0.9 })
      case 'lane': case 'gust': return play(name, RECIPES[name], { pan: panFor(name, { dir }) })
      case 'hit': duckMusic(1.2); return play('hit', RECIPES.hit, { priority: true })
      case 'complete': duckMusic(1.5); return play('complete', RECIPES.complete, { priority: true })
      case 'jump': case 'land': case 'duck': case 'nearMiss': case 'start': return play(name, RECIPES[name], { pan: panFor(name, { x: sim.x }) })
      default: return false
    }
  }

  /** Schedule the next bars of music a little ahead of the clock; retune to the world; follow the game's state (calm, full, silent, soft). */
  function musicFrame(sim) {
    const on = enabled && musicEnabled && !sim.auto
    const target = on ? musicTarget(sim.phase, sim.paused) * MUSIC_GAIN : 0
    if (ctx.currentTime >= duckUntil) musicBus.gain.setTargetAtTime(target, ctx.currentTime, 0.5) // (not while ducked for a crash)
    musicFilter.frequency.setTargetAtTime(musicCutoff(sim.mist ?? 0), ctx.currentTime, 0.6)
    if (!on || target === 0 || ctx.state === 'suspended') { nextBar = 0; return } // nothing is scheduled while silent; the clock restarts when it resumes
    if (nextBar < ctx.currentTime) nextBar = ctx.currentTime + 0.1 // first bar, or catching up after a stall: no burst of old bars
    let guard = 0
    while (nextBar < ctx.currentTime + LOOKAHEAD && guard++ < 4) {
      const events = composeBar(musicWorld, barIndex, musicSeed)
      for (const e of events) {
        if (musicVoices >= MUSIC_VOICES) { stats.music.dropped++; continue }
        musicVoices++; stats.music.notes++
        layer(e.layer, nextBar + e.at, 0, 1, () => { musicVoices = Math.max(0, musicVoices - 1) }, musicFilter)
      }
      stats.music.bars++
      nextBar += barSeconds(musicWorld); barIndex++
    }
  }

  /** Every frame: footsteps (distance-driven), hazard warnings, and the wind bed. */
  function frame(sim) {
    if (!ready()) return
    const running = sim.phase === 'running' && !sim.paused
    musicFrame(sim)
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
    setMusicEnabled(v) { musicEnabled = !!v },
    setWorld(id) { musicWorld = id; stats.music.world = id }, // the music retunes at the next bar
    setEnabled(v) { enabled = !!v; if (!enabled && windGain && ready()) windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1) },
    suspend() { if (ready() && ctx.state === 'running') ctx.suspend?.()?.catch?.(() => {}) },
    resume() { if (ready() && ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {}) },
    get supported() { return !!Ctor },
    get started() { return ready() },
    stats,
  }
}
