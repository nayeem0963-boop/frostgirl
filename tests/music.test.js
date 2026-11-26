import test from 'node:test'
import assert from 'node:assert/strict'
import { WORLD_MUSIC, PROGRESSION, CHORD_BARS, BEATS_PER_BAR, midiHz, barSeconds, scaleNote, pitchClasses, rng, composeBar, MUSIC_STATE, musicTarget, musicCutoff } from '../src/runner/audio/music.js'
import { worldIds } from '../src/worlds/runnerThemes.js'

const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440)

test('every world has its own key, scale and tempo, and the tempo is calm', () => {
  assert.deepEqual(Object.keys(WORLD_MUSIC).sort(), [...worldIds].sort())
  const keys = new Set(worldIds.map((id) => `${WORLD_MUSIC[id].root}/${WORLD_MUSIC[id].bpm}`))
  assert.equal(keys.size, worldIds.length, 'no two worlds share both key and tempo')
  for (const id of worldIds) { const w = WORLD_MUSIC[id]; assert.ok(w.bpm >= 50 && w.bpm <= 90, `${id} tempo`); assert.equal(w.scale.length, 5, 'pentatonic'); assert.ok(w.bells > 0 && w.bells < 0.4) }
})

test('pitch maths: A4 is 440 Hz, an octave doubles, scale steps climb octaves', () => {
  assert.equal(midiHz(69), 440); assert.ok(Math.abs(midiHz(81) - 880) < 1e-9)
  const w = WORLD_MUSIC['01']
  assert.equal(scaleNote(w, 0), w.root); assert.equal(scaleNote(w, 5), w.root + 12); assert.equal(scaleNote(w, -5), w.root - 12)
  assert.ok(Math.abs(barSeconds('01') - (60 / 68) * 4) < 1e-12)
})

test('the random source is deterministic and spread across 0..1', () => {
  const a = rng(5), b = rng(5), c = rng(6)
  const xa = Array.from({ length: 50 }, a), xb = Array.from({ length: 50 }, b), xc = Array.from({ length: 50 }, c)
  assert.deepEqual(xa, xb); assert.notDeepEqual(xa, xc)
  assert.ok(xa.every((v) => v >= 0 && v < 1)); assert.ok(Math.abs(xa.reduce((s, v) => s + v, 0) / 50 - 0.5) < 0.15)
})

test('every note of every world, in every bar, is in the world\'s pentatonic scale (so any mix is consonant)', () => {
  for (const id of worldIds) {
    const classes = pitchClasses(WORLD_MUSIC[id])
    for (let bar = 0; bar < 24; bar++) for (const e of composeBar(id, bar, 3)) {
      const m = hzToMidi(e.layer.f0)
      const nearest = Math.round(m)
      const overtone = Math.abs(m - nearest) > 0.2 // the faint overtones (x2.005) and the detuned pad twins are not scale pitches on their own
      if (overtone) continue
      assert.ok(classes.has(((nearest % 12) + 12) % 12), `${id} bar ${bar}: MIDI ${nearest} is not in the scale`)
    }
  }
})

test('composition is deterministic per seed, differs between seeds and worlds, and loops the chord progression', () => {
  assert.deepEqual(composeBar('03', 5, 9), composeBar('03', 5, 9))
  assert.notDeepEqual(composeBar('03', 5, 9), composeBar('03', 5, 10))
  assert.notDeepEqual(composeBar('03', 5, 9), composeBar('04', 5, 9))
  // pad (the long triangle layers) only on the first bar of each chord
  const padBars = []
  for (let bar = 0; bar < PROGRESSION.length * CHORD_BARS * 2; bar++) if (composeBar('01', bar, 1).some((e) => e.layer.type === 'triangle')) padBars.push(bar)
  assert.deepEqual(padBars, [0, 2, 4, 6, 8, 10, 12, 14], 'a new chord every two bars, forever')
})

test('the music is sparse and soft: bounded notes per bar, bounded gains, notes start inside the bar and always end', () => {
  for (const id of worldIds) {
    const dur = barSeconds(id)
    let notes = 0
    for (let bar = 0; bar < 40; bar++) {
      const ev = composeBar(id, bar, 2)
      notes += ev.length
      assert.ok(ev.length <= 20, `${id} bar ${bar}: ${ev.length} layers`)
      for (const e of ev) {
        assert.ok(e.at >= 0 && e.at < dur, 'starts inside its bar')
        assert.ok(e.layer.gain > 0 && e.layer.gain <= 0.1, `gain ${e.layer.gain}`)
        assert.ok(e.layer.dur > 0 && e.layer.dur <= dur * CHORD_BARS + 2, `dur ${e.layer.dur}`)
        assert.ok(e.layer.f0 > 30 && e.layer.f0 < 3300, `pitch ${e.layer.f0}`) // nothing shrill: the highest is a faint overtone near 3 kHz
        if (e.layer.dur === 1.6) assert.ok(e.layer.f0 > 300 && e.layer.f0 < 1450, `bell ${e.layer.f0}`)
      }
    }
    assert.ok(notes / 40 < 14, `${id}: ${(notes / 40).toFixed(1)} layers per bar on average`)
  }
  const dense = (id) => Array.from({ length: 60 }, (_, b) => composeBar(id, b, 1).filter((e) => e.layer.dur < 2).length).reduce((a, b) => a + b, 0)
  assert.ok(dense('03') > dense('05'), 'the bright crystal world has more bells than the dreamy mist world')
})

test('World 07 has an extra upper pad voice and the others do not', () => {
  const upper = (id) => composeBar(id, 0, 1).some((e) => e.layer.gain === 0.025)
  assert.equal(upper('07'), true); for (const id of ['01', '02', '03', '04', '05', '06']) assert.equal(upper(id), false, id)
})

test('state volumes: calm on the start screen, full while running, silent when paused, soft after a crash; mist muffles', () => {
  assert.equal(musicTarget('running', false), 1); assert.equal(musicTarget('running', true), 0); assert.equal(musicTarget('ready', false), MUSIC_STATE.ready)
  assert.ok(musicTarget('gameover', false) < musicTarget('ready', false) && musicTarget('gameover', false) > 0)
  assert.equal(musicTarget('weird', false), 1)
  assert.ok(musicCutoff(1) < musicCutoff(0)); assert.ok(musicCutoff(1) > 1000); assert.equal(musicCutoff(5), musicCutoff(1)); assert.equal(musicCutoff(), musicCutoff(0))
  assert.equal(BEATS_PER_BAR, 4)
})
