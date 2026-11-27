import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { themeFor, worldIds } from '../src/worlds/runnerThemes.js'
import { worlds } from '../src/worlds/config.js'
import { HAPTICS_KEY } from '../src/runner/feel.js'
import { PROGRESS_KEY } from '../src/runner/progress.js'
import { SETTINGS_KEY } from '../src/runner/settings.js'
import { TIER_KEY } from '../src/runner/quality.js'

// The README is the project's entry point: these tests keep what it says about the code true.
const readme = readFileSync('README.md', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const read = (p) => readFileSync(p, 'utf8')

test('the world table lists every world with the finish distance the data says', () => {
  for (const id of worldIds) {
    const w = worlds.find((x) => x.id === id)
    const row = readme.split('\n').find((l) => l.startsWith(`| ${id} ${w.name}`))
    assert.ok(row, `README has a row for World ${id} ${w.name}`)
    assert.ok(row.includes(`${themeFor(id).finishDistance} m`), `World ${id} finish distance in the README: ${row}`)
  }
})

test('every runner URL flag the README documents is really read by the code', () => {
  const src = [read('src/runner/RunnerGame.jsx'), read('src/runner/worlds.js'), read('src/launcher/Launcher.jsx')].join('\n')
  const flags = { world: "get('world')", unlock: "get('unlock')", debug: "has('debug')", fps: "has('fps')", tier: "get('tier')", adapt: "has('adapt')", mode: "get('mode')" }
  for (const [flag, probe] of Object.entries(flags)) {
    assert.ok(src.includes(probe), `the code reads ?${flag} (${probe})`)
    const ticks = String.fromCharCode(96)
    assert.ok(readme.includes(ticks + '?' + flag) || readme.includes(ticks + '&' + flag), `the README documents ?${flag}`)
  }
})

test('every npm script and script file the README names exists', () => {
  for (const m of readme.matchAll(/npm run ([a-z:]+)/g)) assert.ok(pkg.scripts[m[1]], `npm run ${m[1]} exists`)
  assert.ok(pkg.scripts.test && pkg.scripts.check)
  for (const m of readme.matchAll(/scripts\/([a-z-]+\.mjs)/g)) assert.doesNotThrow(() => readFileSync(`scripts/${m[1]}`), `scripts/${m[1]} exists`)
})

test('every e2e section the README lists exists in the e2e script', () => {
  const e2e = read('scripts/runner-e2e.mjs')
  const line = readme.split('\n').find((l) => l.includes('ONLY=')) ?? ''
  const list = line.match(/ONLY=([a-z,]+)/)?.[1].split(',') ?? []
  assert.ok(list.length >= 15, 'the README lists the sections')
  for (const name of list) assert.ok(e2e.includes(`want('${name}')`), `section ${name} exists in scripts/runner-e2e.mjs`)
})

test('the storage keys the README names are the ones the code uses', () => {
  for (const key of [PROGRESS_KEY, SETTINGS_KEY, TIER_KEY]) assert.ok(readme.includes(key), `${key} is in the README`)
  assert.ok(HAPTICS_KEY.startsWith('frost-runner-'))
})

test('the controls the README lists are bound in the code', () => {
  const input = read('src/runner/sim/input.js')
  for (const code of ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD', 'ArrowUp', 'KeyW', 'Space', 'ArrowDown', 'KeyS']) assert.ok(input.includes(code), code)
  const game = read('src/runner/RunnerGame.jsx')
  for (const code of ["'KeyM'", "'KeyP'", "'Escape'", "'KeyR'"]) assert.ok(game.includes(code), code)
})

test('the standing rules are stated, and nothing of the retired Frost Girl game is described as current', () => {
  for (const phrase of ['Auto play', 'cosmetic only', '350k triangles', 'Do not claim something was tested']) assert.ok(readme.includes(phrase), phrase)
  assert.ok(!readme.includes('Other playable worlds and audio are not implemented yet'))
  assert.ok(!readme.includes('?game=original') && !readme.includes('track=straight'), 'no entry points of the retired game')
  assert.ok(!/spiral track prototype|crystals follow a spaced/i.test(readme), 'no description of the retired prototype')
  assert.ok(readme.includes('orb of Chi') && readme.includes('CC BY 4.0'), 'the orb model credit (a CC BY 4.0 requirement) stays')
  assert.ok(readme.startsWith('# Frost\n'), 'the title is Frost')
})
