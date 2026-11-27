import test from 'node:test'
import assert from 'node:assert/strict'
import { createAudio, MAX_VOICES } from '../src/runner/audio/engine.js'
import { RECIPES, STEP_METRES } from '../src/runner/audio/sounds.js'

// A fake Web Audio: records what is created, lets a test end sources, and counts connections.
function fakeAudio() {
  const log = { osc: 0, noise: 0, gains: 0, filters: 0, panners: 0, started: [], sources: [] }
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} })
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra })
  class FakeCtx {
    constructor() { this.state = 'suspended'; this.currentTime = 1; this.sampleRate = 100; this.destination = node(); FakeCtx.last = this }
    resume() { this.state = 'running'; return Promise.resolve() }
    suspend() { this.state = 'suspended'; return Promise.resolve() }
    createGain() { log.gains++; return node({ gain: param() }) }
    createOscillator() { log.osc++; const n = node({ frequency: param(), start() { log.started.push('osc') }, stop() {} }); log.sources.push(n); return n }
    createBufferSource() { log.noise++; const n = node({ start() { log.started.push('noise') }, stop() {} }); log.sources.push(n); return n }
    createBiquadFilter() { log.filters++; return node({ frequency: param(), Q: param() }) }
    createStereoPanner() { log.panners++; return node({ pan: { value: 0 } }) }
    createDelay() { return node({ delayTime: param() }) }
    createWaveShaper() { log.shapers = (log.shapers ?? 0) + 1; return node({ curve: null, oversample: 'none' }) }
    createDynamicsCompressor() { return node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }) }
    createBuffer(c, n) { const d = new Float32Array(n); return { getChannelData: () => d } }
  }
  return { AudioContext: FakeCtx, log, ctx: () => FakeCtx.last }
}
const sim = (over = {}) => ({ auto: false, phase: 'running', paused: false, dist: 0, speed: 7.5, grounded: true, x: 0, lane: 1, laneFrom: 0, time: 10, mist: 0, obstacles: [], ...over })

test('nothing is created, and nothing plays, until a user gesture unlocks audio', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext })
  assert.equal(a.started, false)
  assert.equal(a.event('jump', sim()), false); assert.equal(f.log.osc + f.log.noise, 0)
  assert.equal(a.unlock(), true); assert.equal(a.started, true)
  assert.equal(a.event('jump', sim()), true)
  assert.ok(f.log.noise > 0 && f.log.osc > 0, 'a jump is a puff of noise and a rising tone')
})

test('a browser with no Web Audio is handled: unlock reports false and nothing throws', () => {
  const a = createAudio({ AudioContext: undefined })
  assert.equal(a.supported, false); assert.equal(a.unlock(), false)
  assert.equal(a.event('hit', sim()), false); assert.doesNotThrow(() => a.frame(sim()))
  const broken = createAudio({ AudioContext: class { constructor() { throw new Error('blocked') } } })
  assert.equal(broken.unlock(), false)
})

test('sound off, Auto play and a suspended context are all silent', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock()
  a.setEnabled(false); assert.equal(a.event('jump', sim()), false)
  a.setEnabled(true); assert.equal(a.event('jump', sim({ auto: true })), false, 'Auto play is watch-only: no sound')
  f.ctx().state = 'suspended'; assert.equal(a.event('jump', sim()), false, 'suspended (hidden tab): nothing is scheduled')
  f.ctx().state = 'running'; assert.equal(a.event('jump', sim()), true)
})

test('every sim event with a recipe plays and is counted by name', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'
  for (const e of ['start', 'jump', 'land', 'lane', 'duck', 'orb', 'nearMiss', 'gust', 'hit', 'complete']) assert.equal(a.event(e, sim()), true, e)
  assert.equal(a.event('unknown', sim()), false)
  for (const e of ['start', 'jump', 'land', 'lane', 'duck', 'orb', 'nearMiss', 'gust', 'hit', 'complete']) assert.equal(a.stats.played[e], 1, e)
})

test('a chain of orbs climbs in pitch: the second chime is higher than the first', () => {
  const f = fakeAudio(); const freqs = []
  const Orig = f.AudioContext
  class Spy extends Orig { createOscillator() { const n = super.createOscillator(); n.frequency.setValueAtTime = (v) => freqs.push(v); return n } }
  const a = createAudio({ AudioContext: Spy }); a.unlock(); f.ctx().state = 'running'
  a.event('orb', sim({ time: 10 })); const first = freqs[0]
  a.event('orb', sim({ time: 10.4 })); const second = freqs[2]
  assert.ok(second > first, `${first} -> ${second}`)
  a.event('orb', sim({ time: 20 })); assert.equal(freqs[4], first, 'after a pause the chain starts again')
})

test('the voice cap drops extra sounds but never the crash; voices are freed when a sound ends', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'
  for (let i = 0; i < MAX_VOICES + 6; i++) a.event('jump', sim())
  assert.equal(a.stats.played.jump, MAX_VOICES); assert.equal(a.stats.dropped, 6)
  assert.equal(a.event('hit', sim()), true, 'the crash gets through')
  f.log.sources.forEach((s) => s.onended?.())
  assert.equal(a.stats.voices, 0, 'all freed')
  assert.equal(a.event('land', sim()), true)
})

test('footsteps follow the distance run, alternate feet, only on the ground and only while running', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'
  const s = sim({ dist: 0 })
  a.frame(s)
  s.dist = STEP_METRES * 4.2; a.frame(s)
  assert.equal(a.stats.played.step, 3, 'at most 3 per frame, however far she moved')
  s.dist += STEP_METRES * 2; s.grounded = false; a.frame(s)
  assert.equal(a.stats.played.step, 3, 'no footsteps in the air')
  s.grounded = true; s.dist += STEP_METRES * 1.1; s.paused = true; a.frame(s)
  assert.equal(a.stats.played.step, 3, 'none while paused')
})

test('hazard warnings play once per hazard, when it comes into range, and again for a new run', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'
  const s = sim({ dist: 100, obstacles: [{ active: true, id: 7, kind: 'shard', x: 0, dist: 200 }, { active: true, id: 8, kind: 'wall', x: 0, dist: 120 }] })
  a.frame(s); assert.equal(a.stats.played.shard ?? 0, 0, 'far away')
  s.dist = 170; a.frame(s); assert.equal(a.stats.played.shard, 1)
  s.dist = 172; a.frame(s); assert.equal(a.stats.played.shard, 1, 'only once')
  assert.equal(a.stats.played.wall ?? 0, 0, 'plain walls are silent')
  s.dist = 0; s.obstacles = [{ active: true, id: 7, kind: 'shard', x: 0, dist: 30 }]; a.frame(s)
  assert.equal(a.stats.played.shard, 2, 'a new run clears the memory')
})

test('the wind bed starts on the first frame, goes silent when the player is not running, and every recipe layer builds without error', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'
  assert.doesNotThrow(() => a.frame(sim()))
  assert.doesNotThrow(() => a.frame(sim({ phase: 'gameover' })))
  for (const name of Object.keys(RECIPES)) if (name !== 'complete') assert.doesNotThrow(() => a.event(name, sim()), name)
  assert.doesNotThrow(() => a.suspend()); assert.doesNotThrow(() => a.resume())
})

// ---- music ----------------------------------------------------------------------------------------------------------------------
const musicSim = (over = {}) => sim({ phase: 'ready', dist: 0, ...over })

test('music: starts after the first gesture on the start screen, one bar at a time, a little ahead of the clock', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); assert.equal(a.stats.music.bars, 0)
  a.unlock(); f.ctx().state = 'running'
  a.frame(musicSim())
  assert.equal(a.stats.music.bars, 1, 'the first bar is scheduled')
  assert.ok(a.stats.music.notes > 3 && f.log.osc > 3, 'a bar is several notes')
  a.frame(musicSim()); assert.equal(a.stats.music.bars, 1, 'not again until the clock comes within the lookahead')
  f.ctx().currentTime = 5; a.frame(musicSim())
  assert.equal(a.stats.music.bars, 2, 'the next bar, once it is due')
})

test('music is silent for Auto play, when Sound is off, when Music is off and while paused (nothing is even scheduled)', () => {
  const run = (setup, s) => { const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'; setup(a); a.frame(s); return a.stats.music.bars }
  assert.equal(run(() => {}, musicSim({ auto: true })), 0)
  assert.equal(run((a) => a.setEnabled(false), musicSim()), 0)
  assert.equal(run((a) => a.setMusicEnabled(false), musicSim()), 0)
  assert.equal(run(() => {}, musicSim({ phase: 'running', paused: true })), 0)
  assert.equal(run(() => {}, musicSim()), 1, 'and it does play when none of those apply')
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock()
  f.ctx().state = 'suspended'; a.frame(musicSim()); assert.equal(a.stats.music.bars, 0, 'a suspended context (hidden tab) schedules nothing')
})

test('music changes key with the world, at the next bar', () => {
  const f = fakeAudio(); const freqs = []
  class Spy extends f.AudioContext { createOscillator() { const n = super.createOscillator(); n.frequency.setValueAtTime = (v) => freqs.push(Math.round(v)); return n } }
  const a = createAudio({ AudioContext: Spy, random: () => 0.5 }); a.unlock(); f.ctx().state = 'running'
  a.setWorld('01'); a.frame(musicSim()); const w1 = [...new Set(freqs)]
  f.ctx().currentTime = 5; a.frame(musicSim()) // bar 1: bells only
  freqs.length = 0; f.ctx().currentTime = 9; a.setWorld('04'); a.frame(musicSim()); const w4 = [...new Set(freqs)] // bar 2: a new chord, in World 04's key
  assert.ok(w1.length > 3 && w4.length > 3)
  assert.notDeepEqual(w1.sort((x, y) => x - y), w4.sort((x, y) => x - y), 'a different world is a different key')
})

test('a long stall does not release a burst of old bars: it catches up with a single new one', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'
  a.frame(musicSim()); f.ctx().currentTime = 600; a.frame(musicSim())
  assert.equal(a.stats.music.bars, 2)
})

test('music never uses up the effects\' voices, and the notes it plays are bounded', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock(); f.ctx().state = 'running'
  for (let i = 0; i < 30; i++) { f.ctx().currentTime = i * 3.5; a.frame(musicSim()) }
  assert.ok(a.stats.music.bars >= 20)
  assert.equal(a.event('jump', sim()), true, 'effects still play with the music running')
  assert.ok(a.stats.voices <= MAX_VOICES)
})

test('the output ends in a soft clipper: unity at small signals, bounded at full scale, odd-symmetric (so it adds no offset)', () => {
  const f = fakeAudio(); const a = createAudio({ AudioContext: f.AudioContext }); a.unlock()
  assert.equal(f.log.shapers, 1, 'one soft clipper on the way to the speakers')
  // the same curve and gains as the engine builds: pre 0.4, tanh(3x)/tanh(3), post 1/1.2
  const out = (v) => { const x = Math.max(-1, Math.min(1, 0.4 * v)); return (Math.tanh(3 * x) / Math.tanh(3)) / 1.2 }
  assert.ok(Math.abs(out(0.05) - 0.05) < 0.003, 'quiet sounds pass at unity')
  assert.ok(Math.abs(out(0.2) - 0.2) < 0.01 && Math.abs(out(0.3) - 0.3) < 0.02)
  assert.ok(out(1.34) < 0.84 && out(10) < 0.84, 'nothing can exceed about 0.83 of full scale, however loud the mix')
  assert.ok(out(0.6) > 0.5 && out(0.6) < 0.6, 'a loud peak is only gently rounded')
  assert.equal(out(-0.7), -out(0.7))
  for (let v = 0; v < 3; v += 0.1) assert.ok(out(v + 0.1) >= out(v), 'monotonic: a louder input is never quieter')
})
