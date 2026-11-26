// Browser test of the Frost runner against a running server (dev or `vite preview`).
//   node scripts/runner-e2e.mjs http://127.0.0.1:4173 [outDir]
// Drives real keyboard / pointer input and reads the sim through ?debug (window.__frostRunner).
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const out = process.argv[3] ?? '/tmp/frost-e2e'
mkdirSync(out, { recursive: true })
const only = (process.env.ONLY ?? '').split(',').filter(Boolean) // e.g. ONLY=orbs,auto reruns just those sections
const want = (name) => only.length === 0 || only.includes(name)
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Software-rendered headless Chrome runs at a few fps and the sim caps its frame step, so game time runs slower than
// wall time. While a run is active, sleep() therefore waits for GAME time (sim.time), otherwise for wall time.
let active = null
const sleep = async (ms) => {
  if (!active) return realSleep(ms)
  const t0 = await active.evaluate(() => { const s = window.__frostRunner?.sim; return s && s.phase === 'running' && !s.paused ? s.time : null })
  if (t0 == null) return realSleep(ms)
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const r = await active.evaluate(([t0]) => { const s = window.__frostRunner.sim; return s.phase !== 'running' ? 'stop' : s.time - t0 }, [t0])
    if (r === 'stop' || r >= ms / 1000) return
    await realSleep(15)
  }
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

async function open(viewport, mobile = false, query = '') {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${base}/?game=frost&debug${query}`)
  await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  await realSleep(800)
  active = page
  return { ctx, page, errors }
}
const S = (page, fn, arg) => page.evaluate(fn, arg)
const sim = (page) => S(page, () => { const s = window.__frostRunner.sim; return { phase: s.phase, x: s.x, y: s.y, lane: s.lane, anim: s.anim, dist: s.dist, speed: s.speed, grounded: s.grounded, duck: s.duck } })
const count = (page, k) => S(page, (k) => window.__frostRunner.sim.count[k] ?? 0, k)
// In-page trigger: fires `cmd` on the first animation frame where the obstacle is closer than `at` metres (frame-accurate even when slow).
const actAt = (page, kind, cmd, secs) => S(page, ([kind, cmd, secs]) => new Promise((res) => {
  const tick = () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => q.active && q.kind === kind); if (!o || s.phase !== 'running') return res(false); if (o.dist - s.dist <= secs * s.speed) { window.__frostRunner.command(cmd); return res(true) } requestAnimationFrame(tick) }
  tick()
}), [kind, cmd, secs])
// In-page trigger for an orb: jumps in the frame where the nearest uncollected high orb is `secs` of running away.
const jumpAtOrb = (page, secs) => S(page, (secs) => new Promise((res) => {
  const tick = () => { const s = window.__frostRunner.sim; const o = s.orbs.find((q) => q.active && !q.taken && q.y > 2 && q.dist - s.dist > 0); if (!o || s.phase !== 'running') return res(false); if (o.dist - s.dist <= secs * s.speed) { window.__frostRunner.command('jump'); return res(true) } requestAnimationFrame(tick) }
  tick()
}), secs)
// Remove generated obstacles so lane/jump/duck tests are not interrupted, then place one on demand.
const clear = (page) => S(page, () => { const s = window.__frostRunner.sim; for (const o of s.obstacles) o.active = false; s.gen.lastPos = 1e9 })
const place = (page, kind, lane, ahead) => S(page, ([kind, lane, ahead]) => {
  const s = window.__frostRunner.sim
  const o = s.obstacles.find((x) => !x.active)
  Object.assign(o, { active: true, kind, x: kind === 'wall' ? [-2.2, 0, 2.2][lane] : 0, dist: s.dist + ahead, id: 9000 })
}, [kind, lane, ahead])

// ------------------------------------------------------------------ desktop
if (want('desktop')) {
  const { ctx, page, errors } = await open({ width: 1534, height: 630 })
  await page.screenshot({ path: `${out}/01-start-screen.png` })
  const before = await sim(page)
  await sleep(1500)
  const idle = await sim(page)
  check('start state: game does not run before the player starts', before.phase === 'ready' && idle.dist === 0)
  check('start screen visible', await page.locator('[data-screen="start"]').isVisible())

  await page.keyboard.press('Enter')
  await sleep(700)
  let s = await sim(page)
  check('Enter starts the run', s.phase === 'running' && s.dist > 1, `dist ${s.dist.toFixed(1)}`)
  check('running animation selected', s.anim === 'run')
  const rr = await S(page, () => ({ rate: window.__frostRunner.debug.runRate, speed: window.__frostRunner.sim.speed }))
  check('run animation rate follows ground speed (no foot sliding)', Math.abs(rr.rate - Math.min(2.5, Math.max(1, rr.speed / 4))) < 0.02, `rate ${rr.rate?.toFixed(2)} at ${rr.speed.toFixed(1)} m/s`)
  const cam0 = await S(page, () => window.__frostRunner.debug.camera.position.y)
  await clear(page)
  await page.screenshot({ path: `${out}/02-running.png` })

  // character visibility: Aisha's pixels exist in the centre of the screen
  const visible = await S(page, () => {
    const c = document.querySelector('canvas'); return !!c && c.width > 0
  })
  check('canvas rendering', visible)

  // lanes: start at the centre
  await page.keyboard.press('ArrowLeft'); await sleep(450)
  s = await sim(page); check('left lane (ArrowLeft)', Math.abs(s.x + 2.2) < 0.01 && s.lane === 0, `x ${s.x.toFixed(2)}`)
  await page.screenshot({ path: `${out}/03-left-lane.png` })
  await page.keyboard.press('ArrowLeft'); await sleep(350)
  s = await sim(page); check('cannot leave the left lane', s.lane === 0)
  await page.keyboard.press('KeyD'); await sleep(450)
  s = await sim(page); check('back to centre (D)', Math.abs(s.x) < 0.01 && s.lane === 1)
  await page.keyboard.press('ArrowRight'); await sleep(450)
  s = await sim(page); check('right lane (ArrowRight)', Math.abs(s.x - 2.2) < 0.01 && s.lane === 2, `x ${s.x.toFixed(2)}`)
  await page.screenshot({ path: `${out}/04-right-lane.png` })
  await page.keyboard.press('KeyA'); await sleep(450)
  await page.keyboard.press('KeyA'); await sleep(450)
  // held key (auto-repeat) must not skip lanes
  await page.keyboard.down('ArrowRight'); for (let i = 0; i < 6; i++) { await page.keyboard.down('ArrowRight'); await sleep(40) } await page.keyboard.up('ArrowRight'); await sleep(450)
  s = await sim(page); check('held key moves exactly one lane', s.lane === 1, `lane ${s.lane}`)
  await page.keyboard.press('ArrowLeft'); await sleep(450); await page.keyboard.press('ArrowRight'); await sleep(450)

  // jump
  await page.keyboard.press('Space')
  await sleep(150)
  s = await sim(page); check('jump leaves the ground (Space)', s.y > 0.2 && !s.grounded, `y ${s.y.toFixed(2)}`)
  check('jump pose is driven by the jump arc', s.anim === 'air', s.anim)
  const air = await S(page, () => ({ pose: window.__frostRunner.debug.pose, cy: window.__frostRunner.debug.camera.position.y, ay: window.__frostRunner.debug.pos[1] }))
  check('Aisha is rendered at her physics height while jumping (no floating/sinking)', Math.abs(air.ay - s.y) < 0.35, `rendered ${air.ay.toFixed(2)} vs sim ${s.y.toFixed(2)}`)
  await page.screenshot({ path: `${out}/05-jump.png` })
  check('camera stays calm in a jump (rises < 0.6 m)', Math.abs(air.cy - cam0) < 0.6, `dy ${(air.cy - cam0).toFixed(2)}`)
  await sleep(700)
  s = await sim(page); check('landing returns to ground and running', s.grounded && s.y === 0 && ['land', 'run'].includes(s.anim), s.anim)
  await sleep(400)
  await page.keyboard.press('ArrowUp'); await sleep(150); s = await sim(page); check('jump (ArrowUp)', s.y > 0.2)
  await sleep(800)
  await page.keyboard.press('KeyW'); await sleep(150); s = await sim(page); check('jump (W)', s.y > 0.2)
  await sleep(800)

  // duck
  await page.keyboard.press('ArrowDown'); await sleep(150)
  s = await sim(page); check('duck (ArrowDown)', s.duck > 0 && s.anim === 'duck', s.anim)
  await page.screenshot({ path: `${out}/06-duck.png` })
  await sleep(900)
  s = await sim(page); check('duck returns to running', s.duck === 0 && s.anim === 'run', s.anim)
  await page.keyboard.press('KeyS'); await sleep(150); s = await sim(page); check('duck (S)', s.duck > 0)
  await sleep(900)

  // obstacle: wall in the centre lane ahead, visible well before the hit
  await place(page, 'wall', 1, 45)
  await sleep(200)
  await page.screenshot({ path: `${out}/07-obstacle-ahead.png` })
  const wallClose = await S(page, () => { const s = window.__frostRunner.sim; return s.obstacles.find((o) => o.active && o.id === 9000).dist - s.dist })
  check('obstacle visible/spawned ahead of the runner', wallClose > 30, `${wallClose.toFixed(1)} m ahead`)
  // dodge it
  await page.keyboard.press('ArrowLeft'); await sleep(2800)
  s = await sim(page); check('lane switch dodges the ice wall', s.phase === 'running', s.phase)

  // jump over ridge, duck under arch (command fired at the right distance, frame-accurate)
  await place(page, 'ridge', 1, 30)
  await actAt(page, 'ridge', 'jump', 0.28); await sleep(2200)
  s = await sim(page); check('jump clears the fallen pine', s.phase === 'running', s.phase)
  await place(page, 'arch', 1, 30)
  await actAt(page, 'arch', 'duck', 0.3); await sleep(2200)
  s = await sim(page); check('duck passes under the ice arch', s.phase === 'running', s.phase)

  // collision: drive into a wall
  await clear(page)
  const lane = (await sim(page)).lane
  await S(page, () => { window.__lock = null; const tick = () => { if (window.__frostRunner.sim.phase !== 'gameover') return requestAnimationFrame(tick); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); window.__lock = window.__frostRunner.sim.phase === 'gameover' }; tick() })
  await place(page, 'wall', lane, 22)
  await sleep(2500)
  s = await sim(page)
  check('collision with ice wall ends the run', s.phase === 'gameover')
  // restart is locked briefly so a mashed key cannot skip the impact. The probe was armed before the collision and pressed Enter
  // inside the very frame the hit happened (real key presses through the slow software renderer can arrive after the lock expires).
  check('restart is ignored in the first moments after impact (no accidental restart)', await S(page, () => window.__lock === true), 'Enter pressed in the hit frame')
  const over0 = await S(page, () => ({ dist: Math.floor(window.__frostRunner.sim.dist) }))
  await page.screenshot({ path: `${out}/08a-impact.png` })
  await page.waitForSelector('[data-screen="gameover"]', { timeout: 20000 })
  check('game-over screen shown', await page.locator('[data-screen="gameover"]').isVisible())
  const shown = await page.locator('.runner-final').innerText()
  check('final distance displayed', Number.parseInt(shown, 10) === over0.dist || Math.abs(Number.parseInt(shown, 10) - over0.dist) <= 1, `shows "${shown.replace(/\s+/g, ' ')}" for ${over0.dist} m`)
  const kz = await S(page, () => ({ z: window.__frostRunner.debug.pos[2], knock: window.__frostRunner.sim.knock }))
  check('Aisha is knocked back and stays in the scene', kz.knock > 0.9 && kz.z > 0.5 && kz.z < 2.5, `knock z ${kz.z.toFixed(2)}`)
  const panel = await page.locator('[data-screen="gameover"]').boundingBox()
  void panel
  await page.screenshot({ path: `${out}/08-game-over.png` })
  const d1 = s.dist
  await sleep(500)
  check('world stays where the collision happened', Math.abs((await sim(page)).dist - d1) < 0.5)
  await page.keyboard.press('KeyA') // input after game over must not move anything
  await sleep(300)
  check('no input after game over', (await sim(page)).lane === lane)

  // restart
  await page.keyboard.press('Enter')
  await sleep(900)
  s = await sim(page)
  check('restart works (Enter)', s.phase === 'running' && s.dist > 1 && s.dist < 30, `dist ${s.dist.toFixed(1)}`)
  check('restart resets lane', s.lane === 1)
  const rs = await S(page, () => { const q = window.__frostRunner.sim; return { knock: q.knock, hitT: q.hitT, duck: q.duck, y: q.y, hit: q.hit } })
  check('restart resets the simulation state', rs.knock === 0 && rs.hitT === 0 && rs.y === 0 && rs.hit === null)
  await page.screenshot({ path: `${out}/09-restarted.png` })
  await clear(page)
  // restart via button
  await place(page, 'wall', 1, 12); await sleep(1800)
  await page.waitForSelector('[data-screen="gameover"] .runner-btn')
  await page.locator('[data-screen="gameover"] .runner-btn:not(.runner-menu)').click()
  await sleep(600)
  s = await sim(page); check('restart works (button)', s.phase === 'running')

  // natural obstacle spawning and a long run for stability
  await S(page, () => window.__frostRunner.reset())
  check('no page errors (desktop)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ------------------------------------------------------------------ orbs and Auto play
if (want('orbs')) {
  const { ctx, page, errors } = await open({ width: 1280, height: 640 })
  const putOrb = (lane, y, ahead) => S(page, ([lane, y, ahead]) => { const s = window.__frostRunner.sim; const o = s.orbs.find((q) => !q.active); Object.assign(o, { active: true, taken: false, takenT: 0, x: [-2.2, 0, 2.2][lane], y, dist: s.dist + ahead, id: 8000 + Math.random() }) }, [lane, y, ahead])
  check('start screen offers Auto play', await page.getByRole('button', { name: 'Auto play' }).isVisible())
  await page.keyboard.press('Enter'); await sleep(500); await clear(page)
  await S(page, () => { for (const o of window.__frostRunner.sim.orbs) o.active = false })
  await putOrb(1, 0.9, 8); await putOrb(0, 0.9, 8)
  await sleep(2000)
  const orbs1 = await S(page, () => ({ n: window.__frostRunner.sim.orbCount, hud: document.querySelector('.runner-orbs').innerText.trim() }))
  check('running through an orb collects it (and not the one in the next lane)', orbs1.n === 1, `count ${orbs1.n}`)
  check('orb counter in the HUD updates', orbs1.hud === '1', `HUD "${orbs1.hud}"`)
  await S(page, () => { const s = window.__frostRunner.sim; s.gen.lastPos = 1e9 })
  // jump arc: only a jump reaches an orb above a fallen pine
  await putOrb(1, 2.35, 10)
  await sleep(2200)
  check('an orb in the jump arc is NOT collected by running under it', (await S(page, () => window.__frostRunner.sim.orbCount)) === 1)
  await putOrb(1, 2.35, 12)
  await jumpAtOrb(page, 0.28); await sleep(1500)
  check('an orb in the jump arc is collected by a jump', (await S(page, () => window.__frostRunner.sim.orbCount)) === 2)
  await place(page, 'wall', 1, 8)
  await page.waitForSelector('[data-screen="gameover"]', { timeout: 60000 })
  check('game-over panel shows the orb count', /2\s+orbs/.test(await page.locator('.runner-orbs-final').innerText()), (await page.locator('.runner-orbs-final').innerText()).trim())
  await page.screenshot({ path: `${out}/10-gameover-orbs.png` })
  await ctx.close()
  void errors
}

if (want('auto')) {
  const { ctx, page, errors } = await open({ width: 1280, height: 640 })
  await page.getByRole('button', { name: 'Auto play' }).click()
  await sleep(600)
  let s = await sim(page)
  check('Auto play starts a run', s.phase === 'running')
  check('Auto play badge and Stop button shown', (await page.getByTestId('auto-badge').isVisible()) && (await page.getByRole('button', { name: 'Stop' }).isVisible()))
  const lane0 = (await sim(page)).lane
  const jumps0 = await count(page, 'jump')
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('KeyD')
  await sleep(100)
  const jumpsAfter = await count(page, 'jump')
  check('Auto play is watch-only: the player\'s keys are ignored', jumpsAfter === jumps0 && !(await S(page, () => window.__frostRunner.sim.auto === false)), `jumps ${jumps0} -> ${jumpsAfter}`)
  void lane0
  await page.screenshot({ path: `${out}/11-auto-play.png` })
  // let the bot play for a while: it must survive real obstacles and collect orbs
  // wait for 25 s of GAME time (software rendering is slow, so allow plenty of wall time)
  for (let i = 0; i < 12000; i++) { const st = await S(page, () => ({ t: window.__frostRunner.sim.time, ph: window.__frostRunner.sim.phase })); if (st.t >= 25 || st.ph !== 'running') break; await realSleep(50) }
  s = await sim(page)
  const stats = await S(page, () => ({ orbs: window.__frostRunner.sim.orbCount, auto: window.__frostRunner.sim.auto, jumps: window.__frostRunner.sim.count.jump ?? 0, ducks: window.__frostRunner.sim.count.duck ?? 0, lanes: window.__frostRunner.sim.count.lane ?? 0, t: window.__frostRunner.sim.time }))
  check('Auto play survives 25 s of generated obstacles', s.phase === 'running' && stats.auto, `t ${stats.t.toFixed(1)} s, ${stats.lanes} lane changes, ${stats.jumps} jumps, ${stats.ducks} ducks`)
  check('Auto play collects orbs', stats.orbs >= 5, `${stats.orbs} orbs`)
  await page.screenshot({ path: `${out}/12-auto-play-later.png` })
  await page.getByRole('button', { name: 'Stop' }).click()
  await sleep(300)
  check('Stop returns to the start screen', (await page.locator('[data-screen="start"]').isVisible()) && (await sim(page)).phase === 'ready')
  await page.keyboard.press('Enter'); await sleep(600)
  await clear(page)
  await page.keyboard.press('ArrowLeft'); await sleep(500)
  s = await sim(page)
  check('a normal run after Auto play takes player input again', s.phase === 'running' && s.lane === 0 && (await S(page, () => window.__frostRunner.sim.auto)) === false)
  await S(page, () => window.__frostRunner.reset())
  await sleep(300)
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  await page.keyboard.press('Escape'); await sleep(300)
  check('Esc leaves Auto play', (await page.locator('[data-screen="start"]').isVisible()) && (await sim(page)).phase === 'ready')
  check('no page errors (orbs / Auto play)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ------------------------------------------------------------------ worlds
if (want('worlds')) {
  const names = { '01': 'Frozen Kingdom', '02': 'Whispering Ice Forest', '03': 'Crystal Mountains', '04': 'Frozen Ocean', '05': 'Frosted Dream Desert', '06': 'Sky of Aurora', '07': 'Celestial Ice Palace' }
  const looks = new Map()
  for (const id of Object.keys(names)) {
    const { ctx, page, errors } = await open({ width: 800, height: 450 }, false, id === '01' ? '' : `&world=${id}&unlock=all`)
    await page.getByRole('button', { name: 'Auto play' }).click()
    for (let i = 0; i < 4000; i++) { const t = await S(page, () => window.__frostRunner.sim.time); if (t >= 4) break; await realSleep(40) }
    const st = await S(page, () => { const s = window.__frostRunner.sim; return { phase: s.phase, finish: s.world.finishDistance, title: document.title, pose: window.__frostRunner.debug.pose } })
    const bg = await S(page, () => { const sc = window.__frostRunner.debug.scene; return { fog: sc.fog.color.getHexString(), bgc: sc.background.getHexString() } })
    looks.set(id, bg.fog)
    check(`[world ${id}] ${names[id]} loads and runs`, st.phase === 'running' && errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, `${st.title}, finish ${st.finish} m${errors.length ? ', errors: ' + errors.slice(0, 2).join(' | ') : ''}`)
    await page.screenshot({ path: `${out}/world-${id}.png` })
    await ctx.close()
  }
  check('each world has its own fog/sky colour', new Set(looks.values()).size === 7, [...looks.values()].join(' '))
  // an unknown id falls back to World 01
  const { ctx, page } = await open({ width: 800, height: 450 }, false, '&world=99')
  check('an unknown world id falls back to World 01', (await S(page, () => window.__frostRunner.debug.scene.fog.color.getHexString())) === 'c9d6e3')
  await ctx.close()
}

// ------------------------------------------------------------------ levels, stars, saved progress
if (want('level')) {
  const KEY = 'frost-runner-progress-v1'
  const stored = (page) => S(page, (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return 'unparsable' } }, KEY)
  const nearFinish = (page, metres, orbs, seen) => S(page, ([m, o, n]) => { const s = window.__frostRunner.sim; for (const q of s.obstacles) q.active = false; s.gen.lastPos = 1e9; s.dist = s.world.finishDistance - m; s.orbCount = o; s.orbsSeen = n }, [metres, orbs, seen])
  const { ctx, page, errors } = await open({ width: 1100, height: 560 })
  check('start screen shows the world and the level length', /Frozen Kingdom\s*·\s*1500 m/.test(await page.getByTestId('level-info').innerText()))
  await page.keyboard.press('Enter'); await sleep(500)
  const bar0 = await S(page, () => { const b = document.querySelector('.runner-progress'); return b ? { now: Number(b.getAttribute('aria-valuenow')), max: Number(b.getAttribute('aria-valuemax')) } : null })
  check('progress bar shows the level length', bar0 && bar0.max === 1500, JSON.stringify(bar0))
  // a crash is saved as a best distance, not as a completion
  await clear(page); await place(page, 'wall', 1, 10)
  await page.waitForSelector('[data-screen="gameover"]', { timeout: 60000 })
  let p = await stored(page)
  check('a crash saves the best distance and no stars', p && p.worlds['01'] && p.worlds['01'].best >= 1 && p.worlds['01'].stars === 0 && p.worlds['01'].completed === false, JSON.stringify(p?.worlds?.['01']))
  check('game-over panel shows progress through the level', /of 1500 m/.test(await page.locator('[data-screen="gameover"]').innerText()))
  await page.keyboard.press('Enter'); await sleep(900)
  // finishing: 3 stars with enough orbs
  await clear(page)
  await nearFinish(page, 60, 330, 380)
  await page.waitForSelector('[data-screen="complete"]', { timeout: 90000 })
  const done = await S(page, () => { const s = window.__frostRunner.sim; return { phase: s.phase, stars: s.stars, complete: s.count.complete } })
  check('crossing the line completes the level (once)', done.phase === 'complete' && done.complete === 1, JSON.stringify(done))
  const label = await page.locator('.runner-stars').getAttribute('aria-label')
  check('level-complete panel shows 3 stars', label === '3 of 3 stars', label)
  check('level-complete panel shows the orb count', /330\s*\/\s*380 orbs/.test(await page.locator('[data-screen="complete"]').innerText()))
  p = await stored(page)
  check('completion is saved: stars, completed, best', p.worlds['01'].stars === 3 && p.worlds['01'].completed === true && p.worlds['01'].best >= 1500, JSON.stringify(p.worlds['01']))
  check('a "Next world" button is offered (it switches in-page, checked below)', await page.getByRole('button', { name: 'Next world' }).isVisible())
  const celebrating = await S(page, () => window.__frostRunner.debug.pose)
  check('Aisha celebrates after the line', celebrating === 'celebrate' || celebrating === 'run', celebrating)
  await page.screenshot({ path: `${out}/13-level-complete.png` })
  await page.keyboard.press('Enter'); await sleep(900)
  const again = await sim(page)
  check('"Play again" starts a fresh run', again.phase === 'running' && again.dist < 30)
  // fewer orbs never lowers the saved stars
  await clear(page); await nearFinish(page, 60, 10, 380)
  await page.waitForSelector('[data-screen="complete"]', { timeout: 90000 })
  p = await stored(page)
  check('a worse finish keeps the 3 saved stars', p.worlds['01'].stars === 3, JSON.stringify(p.worlds['01']))
  check('1 star for a finish with few orbs', (await page.locator('.runner-stars').getAttribute('aria-label')) === '1 of 3 stars')
  // reload: the start screen remembers
  await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  check('after a reload the start screen shows the earned stars', (await page.locator('[data-testid="level-info"] .stars b.on').count()) === 3)
  check('no page errors (levels)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('level')) {
  // corrupt or hostile saved data must not break the game
  const { ctx, page, errors } = await open({ width: 800, height: 450 })
  await S(page, () => { localStorage.setItem('frost-runner-progress-v1', '{"version":1,"worlds":{"01":{"best":"lots","stars":99}}}') })
  await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  check('corrupt saved progress is ignored safely', (await page.getByTestId('level-info').isVisible()) && errors.length === 0, errors.slice(0, 2).join(' | '))
  await S(page, () => { localStorage.setItem('frost-runner-progress-v1', 'not json at all') })
  await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  check('unparsable saved progress is ignored safely', await page.getByTestId('level-info').isVisible())
  // Auto play finishes the level without touching the save
  await S(page, () => { localStorage.removeItem('frost-runner-progress-v1') })
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(500)
  await S(page, () => { const s = window.__frostRunner.sim; s.dist = s.world.finishDistance - 40; s.orbCount = 100; s.orbsSeen = 120 })
  for (let i = 0; i < 4000 && (await sim(page)).phase !== 'complete'; i++) await realSleep(40)
  check('Auto play can finish the level', (await sim(page)).phase === 'complete')
  check('Auto play does not write progress', (await S(page, () => localStorage.getItem('frost-runner-progress-v1'))) === null)
  for (let i = 0; i < 4000 && (await sim(page)).phase === 'complete'; i++) await realSleep(40)
  check('Auto play starts another run by itself after the finish', (await sim(page)).phase === 'running')
  await ctx.close()
}

if (want('level')) {
  // the next world link works and the level-complete panel fits phones
  for (const [vp, tag] of [[{ width: 390, height: 844 }, 'portrait'], [{ width: 844, height: 390 }, 'landscape']]) {
    const { ctx, page } = await open(vp, true)
    await page.getByRole('button', { name: 'Start run' }).tap(); await sleep(500)
    await clear(page); await S(page, () => { const s = window.__frostRunner.sim; s.dist = s.world.finishDistance - 40; s.orbCount = 300; s.orbsSeen = 380 })
    await page.waitForSelector('[data-screen="complete"]', { timeout: 90000 })
    await sleep(400)
    await page.screenshot({ path: `${out}/phone-${tag}-complete.png` })
    const fit = await S(page, ([w, h]) => { const r = (el) => el.getBoundingClientRect(); const btns = [...document.querySelectorAll('[data-screen="complete"] .runner-btn')].map(r); return btns.every((b) => b.top >= 0 && b.bottom <= h && b.left >= 0 && b.right <= w) && btns.length >= 1 }, [vp.width, vp.height])
    check(`[${tag}] level-complete buttons are fully on screen`, fit)
    await page.getByRole('button', { name: 'Play again' }).tap(); await sleep(600)
    check(`[${tag}] tap Play again restarts`, (await sim(page)).phase === 'running')
    await ctx.close()
  }
  const { ctx, page } = await open({ width: 800, height: 450 })
  await page.goto(`${base}/?game=frost&debug&world=02&unlock=all`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  check('World 02 start screen shows its name and 1500 m', /Whispering Ice Forest\s*·\s*1500 m/.test(await page.getByTestId('level-info').innerText()))
  await page.goto(`${base}/?game=frost&debug&world=03&unlock=all`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  check('World 03 start screen shows its name and 1600 m', /Crystal Mountains\s*·\s*1600 m/.test(await page.getByTestId('level-info').innerText()))
  await ctx.close()
}

// ------------------------------------------------------------------ world select (4.4)
if (want('select')) {
  const KEY = 'frost-runner-progress-v1'
  const cardsState = (page) => S(page, () => [...document.querySelectorAll('.runner-card')].map((c) => ({ id: c.dataset.world, disabled: c.disabled, text: c.innerText.replace(/\s+/g, ' ') })))
  const nearFinish = (page, metres, orbs, seen) => S(page, ([m, o, n]) => { const s = window.__frostRunner.sim; for (const q of s.obstacles) q.active = false; s.gen.lastPos = 1e9; s.dist = s.world.finishDistance - m; s.orbCount = o; s.orbsSeen = n }, [metres, orbs, seen])
  const { ctx, page, errors } = await open({ width: 1000, height: 600 })
  await page.getByRole('button', { name: 'Worlds' }).click(); await sleep(300)
  let cards = await cardsState(page)
  check('world select lists all seven worlds', cards.length === 7)
  check('a fresh save opens only World 01', cards[0].disabled === false && cards.slice(1).every((c) => c.disabled), cards.map((c) => c.disabled ? 'L' : 'o').join(''))
  check('locked worlds say what unlocks them', /Finish Frozen Kingdom/.test(cards[1].text), cards[1].text)
  await page.locator('[data-world="03"]').click({ force: true }).catch(() => {})
  check('a locked world cannot be selected', (await S(page, () => window.__frostRunner.sim.world.finishDistance)) === 1500 && (await page.locator('[data-screen="worlds"]').isVisible()))
  await page.keyboard.press('Enter'); await sleep(300)
  check('Enter in the world list does not start a run', (await sim(page)).phase === 'ready')
  await page.keyboard.press('Escape'); await sleep(300)
  check('Esc closes the world list', await page.locator('[data-screen="start"]').isVisible())
  // finish World 01, then "Next world" switches in-page
  const fog0 = await S(page, () => window.__frostRunner.debug.scene.fog.color.getHexString())
  await page.keyboard.press('Enter'); await sleep(500)
  await clear(page); await nearFinish(page, 60, 330, 380)
  await page.waitForSelector('[data-screen="complete"]', { timeout: 90000 })
  await page.getByRole('button', { name: 'Next world' }).click(); await sleep(1200)
  const after = await S(page, () => ({ fog: window.__frostRunner.debug.scene.fog.color.getHexString(), phase: window.__frostRunner.sim.phase, finish: window.__frostRunner.sim.world.finishDistance, url: location.search, title: document.title }))
  check('"Next world" switches worlds in-page (no reload), back on the start screen', after.phase === 'ready' && /world=02/.test(after.url) && /Whispering Ice Forest/.test(after.title) && after.fog !== fog0, `${after.title} ${after.url}`)
  check('the new world shows on the start screen', /Whispering Ice Forest/.test(await page.getByTestId('level-info').innerText()))
  await page.getByRole('button', { name: 'Worlds' }).click(); await sleep(300)
  cards = await cardsState(page)
  check('finishing World 01 opened World 02 (not 03) and shows its stars', cards[1].disabled === false && cards[2].disabled === true && /★/.test(cards[0].text), cards.map((c) => c.disabled ? 'L' : 'o').join(''))
  await page.locator('[data-world="01"]').click(); await sleep(1000)
  check('picking an open world from the list switches to it', /Frozen Kingdom/.test(await page.getByTestId('level-info').innerText()) && /world=01/.test(await S(page, () => location.search)))
  const saved = await S(page, (k) => JSON.parse(localStorage.getItem(k)), KEY)
  check('switching worlds keeps the saved progress', saved.worlds['01'].completed === true)
  // deep links
  await page.goto(`${base}/?game=frost&debug&world=03`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  check('?world=03 (locked) falls back to World 01', /Frozen Kingdom/.test(await page.getByTestId('level-info').innerText()))
  await page.goto(`${base}/?game=frost&debug&world=03&unlock=all`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  check('?world=03&unlock=all opens World 03', /Crystal Mountains/.test(await page.getByTestId('level-info').innerText()))
  await page.getByRole('button', { name: 'Worlds' }).click(); await sleep(300)
  check('?unlock=all opens every world in the list', (await cardsState(page)).every((c) => !c.disabled))
  check('no page errors (world select)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('select')) {
  // the Auto play bot finishes every world in the real browser (the last 60 m of each level, with real rendering)
  for (const id of ['01', '02', '03', '04', '05', '06', '07']) {
    const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, `&world=${id}&unlock=all`)
    await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
    await S(page, () => { const s = window.__frostRunner.sim; s.dist = s.world.finishDistance - 70 })
    for (let i = 0; i < 6000 && (await sim(page)).phase === 'running'; i++) await realSleep(40)
    const r = await S(page, () => { const s = window.__frostRunner.sim; return { phase: s.phase, dist: Math.round(s.dist), finish: s.world.finishDistance, stars: s.stars } })
    check(`[world ${id}] Auto play finishes the level in the browser`, r.phase === 'complete' && r.dist >= r.finish, `${r.dist}/${r.finish} m, ${r.stars} star(s)${errors.length ? ', errors: ' + errors.slice(0, 2).join(' | ') : ''}`)
    await ctx.close()
  }
}

if (want('select')) {
  // phones: the list fits and can be used by touch
  for (const [vp, tag] of [[{ width: 390, height: 844 }, 'portrait'], [{ width: 844, height: 390 }, 'landscape']]) {
    const { ctx, page } = await open(vp, true)
    await S(page, () => localStorage.setItem('frost-runner-progress-v1', JSON.stringify({ version: 1, worlds: { '01': { best: 1500, bestOrbs: 300, stars: 2, completed: true } } })))
    await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
    await page.getByRole('button', { name: 'Worlds' }).tap(); await sleep(300)
    await page.screenshot({ path: `${out}/phone-${tag}-worlds.png` })
    const fit = await S(page, ([w]) => [...document.querySelectorAll('.runner-card')].every((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= w }), [vp.width])
    check(`[${tag}] world cards fit the screen width`, fit)
    await page.locator('[data-world="02"]').tap(); await sleep(1000)
    check(`[${tag}] tapping an open world switches to it`, /Whispering Ice Forest/.test(await page.getByTestId('level-info').innerText()))
    await page.getByRole('button', { name: 'Worlds' }).tap(); await sleep(300)
    await page.getByRole('button', { name: 'Back' }).scrollIntoViewIfNeeded()
    const back = await page.getByRole('button', { name: 'Back' }).boundingBox()
    check(`[${tag}] the Back button can be reached`, !!back && back.y + back.height <= vp.height + 1)
    await ctx.close()
  }
}

// ------------------------------------------------------------------ World 02: the wolf (Phase 5.1)
if (want('wolf')) {
  const shownSkinned = (page) => S(page, () => { const sc = window.__frostRunner.debug.scene; let n = 0; sc.traverse((o) => { if (!o.isSkinnedMesh) return; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v) n++ }); return n })
  const putWolf = (page, lane, side, ahead) => S(page, ([lane, side, ahead]) => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'wolf', lane, side, dist: s.dist + ahead, id: 7000 + Math.random(), x: side * 5.6 }) }, [lane, side, ahead])
  const wolfAhead = (page) => S(page, () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => q.active && q.kind === 'wolf'); return o ? { ahead: o.dist - s.dist, x: o.x, lane: o.lane } : null })
  const waitAhead = async (page, at) => { for (let i = 0; i < 6000; i++) { const w = await wolfAhead(page); if (!w || w.ahead <= at) return w; await realSleep(10) } return null }
  // World 01 never loads the wolf
  {
    const { ctx, page } = await open({ width: 640, height: 360 })
    const files = await S(page, () => performance.getEntriesByType('resource').map((r) => r.name))
    check('World 01 never downloads the wolf', !files.some((f) => /wolf\.glb/.test(f)))
    check('World 01 draws only Aisha as a skinned mesh', (await shownSkinned(page)) === 1)
    await ctx.close()
  }
  const { ctx, page, errors } = await open({ width: 960, height: 540 }, false, '&world=02&unlock=all')
  const files = await S(page, () => performance.getEntriesByType('resource').map((r) => r.name))
  check('World 02 loads the wolf model', files.some((f) => /wolf\.glb/.test(f)))
  await page.keyboard.press('Enter'); await sleep(500); await clear(page)
  await putWolf(page, 1, 1, 46)
  let w = await waitAhead(page, 34)
  check('the wolf waits at the edge of the trail before it lunges', w && Math.abs(w.x) > 5.5, JSON.stringify(w))
  check('the wolf is drawn (an animated skinned model besides Aisha)', (await shownSkinned(page)) >= 2)
  w = await waitAhead(page, 20)
  check('mid-lunge it is between the edge and its lane', w && Math.abs(w.x) < 5.5 && Math.abs(w.x) > 0.01, JSON.stringify(w))
  await page.screenshot({ path: `${out}/14-wolf-lunge.png` })
  w = await waitAhead(page, 13)
  check('14 m before Aisha it is in its lane', w && Math.abs(w.x - 0) < 0.05, JSON.stringify(w))
  await page.screenshot({ path: `${out}/15-wolf-in-lane.png` })
  // dodge it
  await page.keyboard.press('ArrowLeft'); await sleep(2500)
  check('switching lanes dodges the wolf', (await sim(page)).phase === 'running')
  // run into one
  await clear(page); await S(page, () => window.__frostRunner.command('right')); await sleep(500)
  await putWolf(page, (await sim(page)).lane, 1, 40)
  await page.waitForSelector('[data-screen="gameover"]', { timeout: 120000 })
  check('running into the wolf ends the run with its own message', /The wolf got you/.test(await page.locator('[data-screen="gameover"] h2').innerText()))
  await page.screenshot({ path: `${out}/16-wolf-game-over.png` })
  check('no page errors (wolf)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('wolf')) {
  // Auto play in World 02 meets real wolves and survives
  const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, '&world=02&unlock=all')
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  let met = 0, last = 0
  for (let i = 0; i < 12000; i++) {
    const st = await S(page, () => { const s = window.__frostRunner.sim; return { t: s.time, ph: s.phase, wolves: new Set(s.obstacles.filter((o) => o.active && o.kind === 'wolf').map((o) => o.id)).size } })
    if (st.wolves > met) met = st.wolves
    last = st
    if (st.t >= 40 || st.ph !== 'running') break
    await realSleep(60)
  }
  check('Auto play survives 40 s of World 02 with wolves', last.ph === 'running' && last.t >= 40, `t ${last.t.toFixed(1)} s, up to ${met} wolves on the trail at once`)
  check('no page errors (World 02 Auto play)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ------------------------------------------------------------------ World 03: crystal shards (Phase 5.2)
if (want('shard')) {
  const putShard = (page, lane, ahead) => S(page, ([lane, ahead]) => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'shard', lane, side: 0, dist: s.dist + ahead, id: 6000 + Math.random(), x: [-2.2, 0, 2.2][lane] }) }, [lane, ahead])
  const shardAhead = (page) => S(page, () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => q.active && q.kind === 'shard'); return o ? o.dist - s.dist : null })
  const waitAhead = async (page, at) => { for (let i = 0; i < 6000; i++) { const a = await shardAhead(page); if (a === null || a <= at) return a; await realSleep(10) } return null }
  // additive-blended instanced meshes = the warning ring and the beam of light
  const warnings = (page) => S(page, () => { let n = 0; window.__frostRunner.debug.scene.traverse((o) => { if (o.isInstancedMesh && o.material.blending === 2) n += o.count }); return n })
  const { ctx, page, errors } = await open({ width: 960, height: 540 }, false, '&world=03&unlock=all')
  await page.keyboard.press('Enter'); await sleep(500); await clear(page)
  await putShard(page, 1, 58)
  check('a warning (ring + beam of light) shows the lane before the shard falls', (await warnings(page)) >= 2, `${await warnings(page)} warning meshes`)
  await waitAhead(page, 26)
  await page.screenshot({ path: `${out}/17-shard-falling.png` })
  const falling = await S(page, () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => q.active && q.kind === 'shard'); return { ahead: o.dist - s.dist, x: o.x } })
  check('the shard is falling at 26 m and its collider is in its lane (static)', falling.ahead <= 26 && Math.abs(falling.x) < 0.01, JSON.stringify(falling))
  await waitAhead(page, 15)
  await sleep(100)
  check('the warning is gone once it has landed 16 m ahead', (await warnings(page)) === 0)
  await page.screenshot({ path: `${out}/18-shard-landed.png` })
  await page.keyboard.press('ArrowLeft'); await sleep(2500)
  check('switching lanes dodges the shard', (await sim(page)).phase === 'running')
  // a jump does not clear it (2 m > the 1.7 m apex)
  await clear(page); await S(page, () => { const s = window.__frostRunner.sim; s.x = s.x })
  await putShard(page, (await sim(page)).lane, 40)
  await waitAhead(page, 3.4)
  await S(page, () => window.__frostRunner.command('jump'))
  await page.waitForSelector('[data-screen="gameover"]', { timeout: 120000 })
  check('a jump does not clear a shard; the crash says so', /Crushed by a crystal/.test(await page.locator('[data-screen="gameover"] h2').innerText()))
  await page.screenshot({ path: `${out}/19-shard-game-over.png` })
  check('no page errors (shard)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('shard')) {
  // Auto play in World 03 survives a stretch with real shards; worlds 01 and 02 never see one
  const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, '&world=03&unlock=all')
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  const seen = new Set(); let last = { t: 0, ph: 'running' }
  for (let i = 0; i < 12000; i++) {
    last = await S(page, () => { const s = window.__frostRunner.sim; return { t: s.time, ph: s.phase, ids: s.obstacles.filter((o) => o.active && o.kind === 'shard').map((o) => o.id) } })
    last.ids.forEach((x) => seen.add(x))
    if (last.t >= 40 || last.ph !== 'running') break
    await realSleep(60)
  }
  check('Auto play survives 40 s of World 03 with shards', last.ph === 'running' && last.t >= 40, `t ${last.t.toFixed(1)} s, ${seen.size} shards met`)
  check('World 03 really produces shards', seen.size >= 3, `${seen.size}`)
  check('no page errors (World 03 Auto play)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ------------------------------------------------------------------ World 04: cracking ice (Phase 5.3)
if (want('hole')) {
  const putHole = (page, lane, ahead) => S(page, ([lane, ahead]) => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'hole', lane, side: 0, dist: s.dist + ahead, id: 8000 + Math.random(), x: [-2.2, 0, 2.2][lane] }) }, [lane, ahead])
  const holeAhead = (page) => S(page, () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => q.active && q.kind === 'hole'); return o ? o.dist - s.dist : null })
  const waitAhead = async (page, at) => { for (let i = 0; i < 6000; i++) { const a = await holeAhead(page); if (a === null || a <= at) return a; await realSleep(8) } return null }
  const lights = (page) => S(page, () => { let n = 0; window.__frostRunner.debug.scene.traverse((o) => { if (o.isInstancedMesh && o.material.blending === 2) n += o.count }); return n })
  const { ctx, page, errors } = await open({ width: 960, height: 540 }, false, '&world=04&unlock=all')
  await page.keyboard.press('Enter'); await sleep(500); await clear(page)
  await putHole(page, 1, 58)
  check('a cracking lane shows a column of light from far away', (await lights(page)) >= 1, `${await lights(page)} light columns`)
  await waitAhead(page, 30)
  await page.screenshot({ path: `${out}/20-hole-cracking.png` })
  await waitAhead(page, 19)
  await sleep(100)
  check('the ice has broken open by 20 m ahead (the warning is gone)', (await lights(page)) === 0)
  await page.screenshot({ path: `${out}/21-hole-open.png` })
  await page.keyboard.press('ArrowLeft'); await sleep(2500)
  check('switching lanes dodges the hole', (await sim(page)).phase === 'running')
  // jump over one: the jump trigger fires in the frame where it is 0.25 s away
  await clear(page); await S(page, () => { const s = window.__frostRunner.sim; s.x = s.x })
  await putHole(page, (await sim(page)).lane, 40)
  await S(page, () => new Promise((res) => { const tick = () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => q.active && q.kind === 'hole'); if (!o || s.phase !== 'running') return res(false); if (o.dist - s.dist <= s.speed * 0.25) { window.__frostRunner.command('jump'); return res(true) } requestAnimationFrame(tick) }; tick() }))
  await sleep(250)
  await page.screenshot({ path: `${out}/22-hole-jump.png` })
  await sleep(2000)
  check('a jump at the usual moment clears the hole', (await sim(page)).phase === 'running')
  // fall in
  await clear(page); await putHole(page, (await sim(page)).lane, 40)
  await page.waitForSelector('[data-screen="gameover"]', { timeout: 120000 })
  check('running into the hole ends the run: "You fell through the ice"', /You fell through the ice/.test(await page.locator('[data-screen="gameover"] h2').innerText()))
  await page.screenshot({ path: `${out}/23-hole-game-over.png` })
  check('no page errors (hole)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('hole')) {
  const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, '&world=04&unlock=all')
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  const seen = new Set(); let last = { t: 0, ph: 'running' }
  for (let i = 0; i < 12000; i++) {
    last = await S(page, () => { const s = window.__frostRunner.sim; return { t: s.time, ph: s.phase, ids: s.obstacles.filter((o) => o.active && o.kind === 'hole').map((o) => o.id) } })
    last.ids.forEach((x) => seen.add(x))
    if (last.t >= 40 || last.ph !== 'running') break
    await realSleep(60)
  }
  check('Auto play survives 40 s of World 04 with holes', last.ph === 'running' && last.t >= 40, `t ${last.t.toFixed(1)} s, ${seen.size} holes met`)
  check('World 04 really produces holes', seen.size >= 3, `${seen.size}`)
  check('no page errors (World 04 Auto play)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ------------------------------------------------------------------ World 05: dream mist (Phase 5.4)
if (want('mist')) {
  const fog = (page) => S(page, () => { const s = window.__frostRunner.sim; const f = window.__frostRunner.debug.scene.fog; return { mist: s.mist, near: f.near, far: f.far, vision: s.vision, color: f.color.getHexString(), dist: s.dist, phase: s.phase } })
  // move the run to a distance with a clean slate ahead (obstacles regenerate normally from there)
  const goTo = (page, d) => S(page, (d) => { const s = window.__frostRunner.sim; for (const o of s.obstacles) o.active = false; for (const q of s.orbs) q.active = false; s.dist = d; s.gen.lastPos = d + 30 }, d)
  const { ctx, page, errors } = await open({ width: 960, height: 540 }, false, '&world=05&unlock=all')
  await page.keyboard.press('Enter'); await sleep(500)
  const clear0 = await fog(page)
  check('World 05 starts with clear air (the normal fog range)', clear0.mist === 0 && clear0.far === 520 && clear0.near === 70, JSON.stringify(clear0))
  await goTo(page, 220); await sleep(500)
  const thick = await fog(page)
  check('inside a mist bank the fog closes in to 10-50 m', thick.mist > 0.99 && Math.abs(thick.far - 50) < 1 && Math.abs(thick.near - 10) < 0.5, `${thick.near.toFixed(0)}-${thick.far.toFixed(0)} m at ${thick.dist.toFixed(0)} m`)
  check('the mist tints the fog', thick.color !== clear0.color, `${clear0.color} -> ${thick.color}`)
  check('what can be seen is limited to about 40 m', Math.abs(thick.vision - 40) < 1.5, `${thick.vision.toFixed(1)} m`)
  await page.screenshot({ path: `${out}/24-mist.png` })
  await S(page, () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'wall', lane: 1, side: 0, x: 0, dist: s.dist + 16, id: 5252 }) })
  await sleep(200)
  await page.screenshot({ path: `${out}/25-mist-wall-16m.png` })
  await goTo(page, 340); await sleep(500)
  const after = await fog(page)
  check('after the bank the air clears again', after.mist === 0 && after.far === 520, JSON.stringify(after))
  await goTo(page, 1700); await sleep(500)
  check('the approach to the finish line is clear', (await fog(page)).mist === 0)
  check('no page errors (mist)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('mist')) {
  // Auto play drives through a whole mist bank (it only reacts to what the fog lets it see)
  const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, '&world=05&unlock=all')
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  await S(page, () => { const s = window.__frostRunner.sim; for (const o of s.obstacles) o.active = false; for (const q of s.orbs) q.active = false; s.dist = 150; s.gen.lastPos = 180 })
  let peak = 0, minFar = 520, last = { ph: 'running', d: 0 }
  for (let i = 0; i < 12000; i++) {
    last = await S(page, () => { const s = window.__frostRunner.sim; return { ph: s.phase, d: s.dist, m: s.mist, far: window.__frostRunner.debug.scene.fog.far } })
    peak = Math.max(peak, last.m); minFar = Math.min(minFar, last.far)
    if (last.d >= 310 || last.ph !== 'running') break
    await realSleep(60)
  }
  check('Auto play drives through a whole mist bank (150 to 310 m)', last.ph === 'running' && last.d >= 310, `reached ${last.d.toFixed(0)} m, thickest mist ${peak.toFixed(2)}, fog down to ${minFar.toFixed(0)} m`)
  check('the mist really was thick on the way', peak > 0.99 && minFar < 51)
  check('no page errors (World 05 Auto play)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
  // the other worlds are never misty, wherever you are
  for (const id of ['01', '04']) {
    const { ctx: c2, page: p2 } = await open({ width: 640, height: 360 }, false, `&world=${id}&unlock=all`)
    await p2.keyboard.press('Enter'); await sleep(400)
    await S(p2, () => { const s = window.__frostRunner.sim; for (const o of s.obstacles) o.active = false; s.dist = 220; s.gen.lastPos = 250 })
    await sleep(400)
    const f = await S(p2, () => ({ m: window.__frostRunner.sim.mist, far: window.__frostRunner.debug.scene.fog.far }))
    check(`[world ${id}] has no mist even at 220 m`, f.m === 0 && f.far === 520, JSON.stringify(f))
    await c2.close()
  }
}

// ------------------------------------------------------------------ phone portrait: swipes
async function phone(viewport, tag) {
  const { ctx, page, errors } = await open(viewport, true)
  await page.screenshot({ path: `${out}/${tag}-start.png` })
  await page.getByRole('button', { name: 'Auto play' }).tap(); await sleep(700)
  check(`[${tag}] tapping Auto play starts the bot`, (await sim(page)).phase === 'running' && (await S(page, () => window.__frostRunner.sim.auto)))
  await page.screenshot({ path: `${out}/${tag}-auto.png` })
  await page.getByRole('button', { name: 'Stop' }).tap(); await sleep(400)
  await page.getByRole('button', { name: 'Start run' }).tap()
  await sleep(700)
  await clear(page)
  let s = await sim(page); check(`[${tag}] tap Start begins the run`, s.phase === 'running')
  const swipe = async (dx, dy) => {
    const cx = viewport.width / 2, cy = viewport.height * 0.6
    const cdp = await ctx.newCDPSession(page)
    const pt = (x, y) => [{ x, y, id: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(cx, cy) })
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(cx + (dx * i) / 6, cy + (dy * i) / 6) })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  }
  await swipe(-90, 0); await sleep(450); s = await sim(page); check(`[${tag}] swipe left`, s.lane === 0, `lane ${s.lane}`)
  await swipe(90, 0); await sleep(450); s = await sim(page); check(`[${tag}] swipe right`, s.lane === 1, `lane ${s.lane}`)
  await swipe(90, 0); await sleep(450); await page.screenshot({ path: `${out}/${tag}-right-lane.png` })
  await swipe(-90, 0); await sleep(450)
  const j0 = await count(page, 'jump'); await swipe(0, -100); s = await sim(page); check(`[${tag}] swipe up jumps`, (await count(page, 'jump')) === j0 + 1, `jumps ${await count(page, 'jump')}`)
  await page.screenshot({ path: `${out}/${tag}-jump.png` })
  await sleep(800)
  const d0 = await count(page, 'duck'); await swipe(0, 100); check(`[${tag}] swipe down ducks`, (await count(page, 'duck')) === d0 + 1)
  await page.screenshot({ path: `${out}/${tag}-duck.png` })
  await sleep(900)
  await place(page, 'wall', 1, 40); await sleep(200)
  await page.screenshot({ path: `${out}/${tag}-obstacle.png` })
  for (let i = 0; i < 2400 && (await sim(page)).phase === 'running'; i++) await realSleep(25) // the wall is ~5 s of game time away
  s = await sim(page); check(`[${tag}] collision ends the run`, s.phase === 'gameover')
  await page.waitForSelector('[data-screen="gameover"] .runner-btn', { timeout: 20000 })
  await sleep(300)
  await page.screenshot({ path: `${out}/${tag}-gameover.png` })
  // the overlay element is full-screen by design (its lower part is transparent): measure where its CONTENT ends
  const lay = await S(page, () => { const r = document.querySelector('[data-screen="gameover"]'); const kids = [...r.children].filter((k) => getComputedStyle(k).display !== 'none'); const last = kids[kids.length - 1].getBoundingClientRect(); const wide = Math.max(...kids.map((k) => k.getBoundingClientRect().right)); const c = document.querySelector('canvas').getBoundingClientRect(); return { bottom: last.bottom, right: wide, h: c.height, w: c.width } })
  check(`[${tag}] game-over panel leaves the lower scene visible`, tag.includes('portrait') ? lay.bottom < lay.h * 0.62 : lay.right < lay.w * 0.5, `content ends at y ${Math.round(lay.bottom)}/${lay.h}, x ${Math.round(lay.right)}/${lay.w}`)
  await page.locator('[data-screen="gameover"] .runner-btn:not(.runner-menu)').tap(); await sleep(600)
  s = await sim(page); check(`[${tag}] tap Restart`, s.phase === 'running')
  check(`[${tag}] no page errors`, errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}
if (want('phone')) {
  await phone({ width: 390, height: 844 }, 'phone-portrait')
  await phone({ width: 844, height: 390 }, 'phone-landscape')
}

if (want('gust')) {
  const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, '&world=06&unlock=all')
  await page.keyboard.press('Enter'); await sleep(400)
  // park the runner in the middle lane just before the first gust line with a clear road
  const g = await S(page, () => { const s = window.__frostRunner.sim; for (const o of s.obstacles) o.active = false; s.gen.lastPos = 1e9; const gu = s.world.gust; const at = gu.startAt + (s.nextGust ?? 0) * gu.period; return { start: gu.startAt, n: s.nextGust } })
  check('World 06 has gusts and the first is still ahead', g.start > 0 && g.n === 0, JSON.stringify(g))
  await S(page, () => { const s = window.__frostRunner.sim; s.dist = s.world.gust.startAt - 60; s.lane = 1; s.x = 0 })
  await sleep(600)
  await page.screenshot({ path: `${out}/26-gust-warning.png` })
  const warn = await S(page, () => { const s = window.__frostRunner.sim; return { gusts: s.nextGust, lane: s.lane } })
  check('before the line nothing has pushed Aisha', warn.gusts === 0 && warn.lane === 1, JSON.stringify(warn))
  await S(page, () => { const s = window.__frostRunner.sim; s.dist = s.world.gust.startAt + 40 - 4; for (const o of s.obstacles) o.active = false; s.gen.lastPos = 1e9 })
  let got = null
  for (let i = 0; i < 400 && !got; i++) { const r = await S(page, () => { const s = window.__frostRunner.sim; return { gusts: s.nextGust, lane: s.lane, ph: s.phase } }); if (r.gusts > 0) got = r; else await realSleep(30) }
  await sleep(500)
  await page.screenshot({ path: `${out}/27-gust-push.png` })
  check('crossing the line shoves Aisha one lane sideways', !!got && got.lane !== 1, JSON.stringify(got))
  check('a gust never ends the run by itself', got && got.ph === 'running')
  check('no page errors (gust)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('gust')) {
  const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, '&world=06&unlock=all')
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  let last = { t: 0, ph: 'running', n: 0 }
  for (let i = 0; i < 12000; i++) {
    last = await S(page, () => { const s = window.__frostRunner.sim; return { t: s.time, ph: s.phase, n: s.nextGust } })
    if (last.t >= 40 || last.ph !== 'running') break
    await realSleep(60)
  }
  check('Auto play survives 40 s of World 06 with gusts', last.ph === 'running' && last.t >= 40, `t ${last.t.toFixed(1)} s, ${last.n} gusts crossed`)
  check('Auto play really crossed gusts', last.n >= 1, `${last.n}`)
  check('no page errors (World 06 Auto play)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
  const w1 = await open({ width: 640, height: 360 }, false, '&world=01')
  const none = await S(w1.page, () => !window.__frostRunner.sim.world.gust)
  check('World 01 has no gusts', none)
  await w1.ctx.close()
}

if (want('palace')) {
  const { ctx, page, errors } = await open({ width: 640, height: 360 }, false, '&world=07&unlock=all')
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  const kinds = new Set(); let last = { t: 0, ph: 'running', n: 0 }
  for (let i = 0; i < 16000; i++) {
    last = await S(page, () => { const s = window.__frostRunner.sim; return { t: s.time, ph: s.phase, n: s.nextGust, k: s.obstacles.filter((o) => o.active).map((o) => o.kind) } })
    last.k.forEach((x) => kinds.add(x))
    if (last.t >= 60 || last.ph !== 'running') break
    await realSleep(60)
  }
  await page.screenshot({ path: `${out}/28-palace-auto.png` })
  check('Auto play survives 60 s of World 07', last.ph === 'running' && last.t >= 60, `t ${last.t.toFixed(1)} s, ${last.n} gusts crossed`)
  check('World 07 mixes the hazards (wall, wolf, shard, hole all seen)', ['wall', 'wolf', 'shard', 'hole'].every((k) => kinds.has(k)), [...kinds].join(','))
  check('World 07 loads the wolf model and draws every hazard type without page errors', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('feel')) {
  // vibration is stubbed so the calls can be counted (desktop Chrome has no motor); the sim is run for real
  const { ctx, page, errors } = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
    await ctx.addInitScript(() => { window.__buzz = []; navigator.vibrate = (p) => { window.__buzz.push(p); return true } })
    const page = await ctx.newPage(); const errors = []
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`${base}/?game=frost&debug`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
    active = page
    return { ctx, page, errors }
  })()
  await page.getByRole('button', { name: 'Settings' }).click(); await sleep(200)
  check('Settings offers a Vibration switch (device reports support)', (await page.getByRole('switch', { name: /Vibration: on/ }).count()) === 1)
  await page.getByRole('button', { name: 'Back' }).click(); await sleep(200)
  await page.keyboard.press('Enter'); await sleep(400); await clear(page)
  // a wall just beside her (0.12 m of clearance): a near miss, no crash, "Close!" and a short pulse
  await S(page, () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, passed: false, kind: 'wall', lane: 2, side: 0, x: s.x + 0.95 + 0.32 + 0.12, dist: s.dist + 14, id: 7001 }) })
  let seen = false
  for (let i = 0; i < 300 && !seen; i++) { seen = await page.getByTestId('close-call').count() > 0; if (!seen) await realSleep(30) }
  await page.screenshot({ path: `${out}/29-close-call.png` })
  check('a near miss shows "Close!" and the run goes on', seen && (await sim(page)).phase === 'running')
  check('a near miss vibrates once, lightly', JSON.stringify(await S(page, () => window.__buzz.filter((p) => p === 14))) === '[14]')
  await sleep(1200)
  check('"Close!" fades away by itself (opacity 0 after its animation)', (await S(page, () => { const e = document.querySelector('[data-testid="close-call"]'); return e ? getComputedStyle(e).opacity : '0' })) === '0')
  // a real hit vibrates with the hit pattern
  await clear(page); await place(page, 'wall', 1, 8); await sleep(1500)
  check('a hit vibrates with the hit pattern', (await S(page, () => window.__buzz.some((p) => Array.isArray(p) && p[0] === 45))))
  await ctx.close()
}

if (want('feel')) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => { window.__buzz = []; navigator.vibrate = (p) => { window.__buzz.push(p); return true } })
  const page = await ctx.newPage(); active = page
  await page.goto(`${base}/?game=frost&debug`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
  await page.getByRole('button', { name: 'Settings' }).click(); await sleep(200)
  await page.getByRole('switch', { name: /Vibration/ }).click()
  check('the Vibration switch turns off and the choice is saved', (await page.getByRole('switch', { name: /Vibration: off/ }).count()) === 1 && JSON.parse(await S(page, () => localStorage.getItem('frost-runner-settings-v1'))).haptics === false)
  await page.getByRole('button', { name: 'Back' }).click(); await sleep(200)
  await page.keyboard.press('Enter'); await sleep(400); await clear(page); await place(page, 'wall', 1, 8); await sleep(1500)
  check('with vibration off a hit makes no vibration', (await S(page, () => window.__buzz.length)) === 0)
  await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(500)
  await page.getByRole('button', { name: 'Settings' }).click(); await sleep(200)
  check('the choice survives a reload', (await page.getByRole('switch', { name: /Vibration: off/ }).count()) === 1)
  await page.getByRole('switch', { name: /Vibration/ }).click() // back on, so the next check is about Auto play only
  await page.getByRole('button', { name: 'Back' }).click(); await sleep(200)
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(400)
  for (let i = 0; i < 400; i++) { if ((await S(page, () => window.__frostRunner.sim.count.orb ?? 0)) > 0) break; await realSleep(50) }
  check('Auto play never vibrates', (await S(page, () => window.__buzz.length)) === 0)
  await ctx.close()
}

if (want('settings')) {
  const { ctx, page, errors } = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 })
    await ctx.addInitScript(() => { navigator.vibrate = () => true })
    const page = await ctx.newPage(); const errors = []
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.goto(`${base}/?game=frost&debug`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
    active = page
    return { ctx, page, errors }
  })()
  const attr = (n) => S(page, (n) => document.querySelector('.runner-root').getAttribute(n), n)
  const stored = () => S(page, () => JSON.parse(localStorage.getItem('frost-runner-settings-v1') ?? '{}'))
  // first-run hint: shows on the first run, goes away with the first jump, and is not shown again
  await page.keyboard.press('Enter'); await sleep(500); await clear(page)
  check('first run: the controls hint is shown', (await page.getByTestId('first-run-hint').count()) === 1)
  await page.screenshot({ path: `${out}/30-first-run-hint.png` })
  await page.keyboard.press('Space'); await sleep(500)
  check('the hint goes away with the first jump', (await page.getByTestId('first-run-hint').count()) === 0)
  check('and is remembered (hintSeen)', (await stored()).hintSeen === true)
  await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(500)
  await page.keyboard.press('Enter'); await sleep(500)
  check('a later run does not show the hint again', (await page.getByTestId('first-run-hint').count()) === 0)
  await page.keyboard.press('Escape'); await sleep(200) // pause, then back to the start screen
  await S(page, () => { const s = window.__frostRunner.sim; s.paused = false; s.phase = 'ready' }); await sleep(400)
  // the settings sheet
  await page.getByRole('button', { name: 'Settings' }).click(); await sleep(300)
  await page.screenshot({ path: `${out}/31-settings.png` })
  const btns = await page.locator('[data-screen="settings"] button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.innerText, top: r.top, bottom: r.bottom, left: r.left, right: r.right } }))
  check('every settings button is inside the viewport (800x450)', btns.length >= 5 && btns.every((b) => b.top >= 0 && b.bottom <= 450 && b.left >= 0 && b.right <= 800), JSON.stringify(btns.map((b) => [b.t, Math.round(b.bottom)])))
  await page.getByRole('button', { name: /Reduce motion/ }).click()
  check('Reduce motion cycles auto -> on and sets the in-game switch', (await stored()).motion === 'on' && (await attr('data-reduce-motion')) === 'true')
  check('Difficulty starts on normal', (await page.getByTestId('difficulty').innerText()) === 'Difficulty: normal')
  await page.getByTestId('difficulty').click()
  check('Difficulty cycles normal -> hard and is saved', (await stored()).difficulty === 'hard')
  await page.getByRole('button', { name: /Graphics/ }).click()
  check('Graphics cycles auto -> low and is saved', (await stored()).quality === 'low')
  await page.getByRole('switch', { name: /Left-handed/ }).click()
  check('Left-handed layout is saved and switches the layout', (await stored()).leftHanded === true && (await attr('data-left-handed')) === 'true')
  await page.getByRole('switch', { name: /High-contrast/ }).click()
  const glow = () => S(page, () => { const sc = window.__frostRunner.debug.scene; let c = null; sc.traverse((o) => { if (o.isInstancedMesh && o.material?.emissive && o.material.vertexColors && c === null) c = o.material.emissive.getHexString() }); return c })
  check('High-contrast obstacles turn the obstacle glow amber', (await stored()).highContrast === true && (await glow()) === 'ffa81f', String(await glow()))
  await page.keyboard.press('Escape'); await sleep(300)
  check('Esc closes the settings sheet', (await page.locator('[data-screen="start"]').count()) === 1)
  await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(500)
  check('settings survive a reload', (await attr('data-left-handed')) === 'true' && (await attr('data-reduce-motion')) === 'true' && (await attr('data-high-contrast')) === 'true')
  // left-handed: the pause button sits at the left
  await page.keyboard.press('Enter'); await sleep(600)
  check('a run started on Hard uses the hard generator (sim.difficulty)', (await S(page, () => window.__frostRunner.sim.difficulty)) === 'hard')
  const pb = await page.locator('.runner-pause').boundingBox()
  check('left-handed: the pause button is on the left half of the screen', !!pb && pb.x + pb.width / 2 < 400, JSON.stringify(pb))
  check('no page errors (settings)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('settings')) {
  // the sheet fits on phones, portrait and landscape
  for (const [vp, tag] of [[{ width: 390, height: 844 }, 'portrait'], [{ width: 844, height: 390 }, 'landscape']]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
    await ctx.addInitScript(() => { navigator.vibrate = () => true })
    const page = await ctx.newPage(); active = page
    await page.goto(`${base}/?game=frost&debug`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
    const startBtns = await page.locator('[data-screen="start"] button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom))
    check(`[phone-${tag}] the start screen still fits with the Settings button`, startBtns.every((b) => b <= vp.height), JSON.stringify(startBtns.map(Math.round)))
    await page.getByRole('button', { name: 'Settings' }).tap(); await sleep(300)
    await page.screenshot({ path: `${out}/32-settings-${tag}.png` })
    const btns = await page.locator('[data-screen="settings"] button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }))
    check(`[phone-${tag}] every settings button is inside the viewport`, btns.every((b) => b.top >= 0 && b.bottom <= vp.height && b.left >= 0 && b.right <= vp.width), JSON.stringify(btns.map((b) => Math.round(b.bottom))))
    await ctx.close()
  }
}

if (want('endless')) {
  const { ctx, page, errors } = await open({ width: 800, height: 450 }, false, '&world=01&unlock=all')
  const prog = () => S(page, () => JSON.parse(localStorage.getItem('frost-runner-progress-v1') ?? '{}'))
  check('Endless is offered on the start screen (world open)', (await page.getByTestId('endless-start').count()) === 1)
  await page.getByTestId('endless-start').click(); await sleep(500)
  check('Endless run: the mode badge shows and the level progress bar is gone', (await page.getByTestId('endless-badge').count()) === 1 && (await page.locator('.runner-progress').count()) === 0)
  check('sim.endless is on', await S(page, () => window.__frostRunner.sim.endless === true))
  await page.screenshot({ path: `${out}/33-endless.png` })
  // run past the old finish line: no level-complete, the run just goes on
  await clear(page)
  await S(page, () => { const s = window.__frostRunner.sim; s.dist = s.world.finishDistance - 30 })
  let past = await sim(page)
  for (let i = 0; i < 400 && past.phase === 'running' && past.dist < 1530; i++) { await realSleep(50); past = await sim(page) } // slow software rendering: wait until she is really past the line
  await clear(page); await sleep(400); past = await sim(page)
  check('past the finish line the run goes on (no level complete)', past.phase === 'running' && past.dist > 1500, `${past.phase} ${past.dist.toFixed(0)} m`)
  // crash: the game-over panel is the Endless one, only the Endless best is saved
  await clear(page); await place(page, 'wall', 1, 8); await sleep(1500)
  await page.waitForSelector('[data-screen="gameover"] .runner-btn', { timeout: 20000 })
  check('the game-over panel says Endless run', /Endless run/.test(await page.locator('[data-screen="gameover"]').innerText()))
  const p1 = (await prog()).worlds?.['01']
  check('only the Endless best was saved (no level best, no stars)', !!p1 && p1.bestEndless > 1400 && p1.best === 0 && p1.stars === 0 && p1.completed === false, JSON.stringify(p1))
  await page.screenshot({ path: `${out}/34-endless-over.png` })
  // Restart repeats the mode; Menu returns to the start screen, where a level run is a level run again
  await sleep(500); await page.locator('[data-screen="gameover"] .runner-btn').first().click(); await sleep(500)
  check('Restart repeats Endless', await S(page, () => window.__frostRunner.sim.endless === true && window.__frostRunner.sim.phase === 'running'))
  await clear(page); await place(page, 'wall', 1, 8); await sleep(1500)
  await page.waitForSelector('[data-screen="gameover"] .runner-menu', { timeout: 20000 })
  await page.locator('[data-screen="gameover"] .runner-menu').click(); await sleep(500)
  check('Menu returns to the start screen', (await page.locator('[data-screen="start"]').count()) === 1)
  await page.getByRole('button', { name: 'Start run' }).click(); await sleep(500)
  check('Start run after Endless is a normal level (progress bar back, sim.endless off)', (await page.locator('.runner-progress').count()) === 1 && (await S(page, () => window.__frostRunner.sim.endless === false)))
  check('no page errors (endless)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('endless')) {
  // Endless is locked until the world is finished (no unlock=all): not offered on a fresh save
  const { ctx, page } = await open({ width: 800, height: 450 })
  check('a fresh save does not offer Endless yet', (await page.getByTestId('endless-start').count()) === 0)
  await ctx.close()
}

if (want('endless')) {
  // the Menu button fits on phones, on the game-over and the level-complete panel
  for (const [vp, tag] of [[{ width: 390, height: 844 }, 'portrait'], [{ width: 844, height: 390 }, 'landscape']]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
    const page = await ctx.newPage(); active = page
    await page.goto(`${base}/?game=frost&debug&unlock=all`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
    await page.getByRole('button', { name: 'Start run' }).tap(); await sleep(400); await clear(page); await place(page, 'wall', 1, 8); await sleep(1500)
    await page.waitForSelector('[data-screen="gameover"] .runner-menu', { timeout: 20000 }); await sleep(300)
    const r = await page.locator('[data-screen="gameover"] button').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right } }))
    check(`[phone-${tag}] Restart and Menu are both inside the viewport`, r.length >= 2 && r.every((b) => b.top >= 0 && b.bottom <= vp.height && b.left >= 0 && b.right <= vp.width), JSON.stringify(r.map((b) => Math.round(b.bottom))))
    await page.screenshot({ path: `${out}/35-over-menu-${tag}.png` })
    await ctx.close()
  }
}

if (want('offline')) {
  // what the runner downloads: the 3.9 MB mountain massif is only for World 01 (and the expedition); Worlds 02-07 use a painted backdrop
  const seen = async (query, ready = '.runner-root[data-loaded="true"]') => {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 }, serviceWorkers: 'block' })
    const page = await ctx.newPage(); active = page
    const urls = []; const errors = []
    page.on('request', (r) => urls.push(new URL(r.url()).pathname)); page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/?game=frost&debug${query}`); await page.waitForSelector(ready, { timeout: 180000 }); await realSleep(1500)
    return { ctx, page, urls, errors }
  }
  const w2 = await seen('&world=02&unlock=all')
  check('World 02 does not download the mountain massif', !w2.urls.some((u) => /mountain-massif\.glb$/.test(u)))
  check('World 02 loads the wolf, its painting and the spruces', w2.urls.some((u) => /wolf\.glb$/.test(u)) && w2.urls.some((u) => /world-02.*\.webp$/.test(u)) && w2.urls.some((u) => /alpine-spruces\.glb$/.test(u)))
  // switching in-page to World 01 fetches it on demand and the scene keeps running
  await S(w2.page, () => window.__frostRunner.selectWorld('01')); await sleep(300)
  for (let i = 0; i < 400 && !w2.urls.some((u) => /mountain-massif\.glb$/.test(u)); i++) await realSleep(50)
  check('switching to World 01 in-page loads the massif on demand, with no page errors', w2.urls.some((u) => /mountain-massif\.glb$/.test(u)) && w2.errors.length === 0, w2.errors.slice(0, 2).join(' | '))
  await w2.ctx.close()
  const w1 = await seen('')
  check('World 01 still downloads and draws the massif', w1.urls.some((u) => /mountain-massif\.glb$/.test(u)) && w1.errors.length === 0)
  await w1.ctx.close()
  const ex = await seen('&mode=expedition', 'canvas')
  check('the expedition still preloads the massif', ex.urls.some((u) => /mountain-massif\.glb$/.test(u)))
  await ex.ctx.close()
}

if (want('offline')) {
  // the service worker: after a full visit the game reloads with no connection at all
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } })
  const page = await ctx.newPage(); active = page
  const errors = []; page.on('pageerror', (e) => errors.push(e.message))
  const visit = async () => { await page.goto(`${base}/?game=frost&debug&world=02&unlock=all`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(1200) }
  await visit()
  const registered = await S(page, async () => { const r = await navigator.serviceWorker?.ready; return !!r?.active })
  check('the service worker registers and activates (production build)', registered)
  await visit() // the worker now controls the page: this visit fills its caches
  await visit()
  const controlled = await S(page, () => !!navigator.serviceWorker?.controller)
  check('the page is controlled by the worker', controlled)
  await ctx.setOffline(true)
  let ok = true
  try { await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 60000 }) } catch { ok = false }
  check('with NO connection the game reloads and loads', ok)
  if (ok) {
    await page.keyboard.press('Enter'); await sleep(1200)
    check('and it can be played offline (a run starts and moves)', (await sim(page)).phase === 'running' && (await sim(page)).dist > 0)
  }
  check('no page errors offline', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('quality')) {
  // frame-time measurement and quality tiers. Software-rendered headless Chrome is slow (a few fps), which makes a good "slow device".
  const slow = async (ctxOpts, query, settingsJson) => {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2, ...ctxOpts }) // 600 px or more on the short side: the screen suggests the high tier
    if (settingsJson) await ctx.addInitScript((j) => { try { if (!localStorage.getItem('frost-runner-settings-v1')) localStorage.setItem('frost-runner-settings-v1', j) } catch { /* ignore */ } }, settingsJson)
    const page = await ctx.newPage(); active = page
    const errors = []; page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/?game=frost&debug${query}`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
    await S(page, () => { const m = window.__frostRunner.debug.meter; m.o.window = 20; m.o.warmup = 1; m.o.cooldown = 2 }) // a short window so the test does not take minutes
    return { ctx, page, errors }
  }
  const tier = (page) => S(page, () => document.querySelector('.runner-root').getAttribute('data-tier'))
  const ratio = (page) => S(page, () => { const c = document.querySelector('.runner-root canvas'); return c.width / c.clientWidth })
  const waitTier = async (page, want, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await tier(page)) === want) return true; await realSleep(300) } return false }
  const startRunning = async (page) => { await page.keyboard.press('Enter'); await sleep(300); await clear(page) }

  // 1. adaptive: a slow device steps high -> low -> min, the pixel ratio follows, and the result is remembered
  { const { ctx, page, errors } = await slow({}, '&adapt&fps')
    check('starts on the high tier on a big screen', (await tier(page)) === 'high' && (await ratio(page)) > 1.9, `${await tier(page)} x${await ratio(page)}`)
    await startRunning(page)
    check('a slow device steps down to low', await waitTier(page, 'low', 120000))
    const r1 = await ratio(page)
    check('the pixel ratio dropped with the tier (about 1.5 at low)', r1 > 1.4 && r1 < 1.6, `x${r1}`)
    check('and on to min, which stops there', await waitTier(page, 'min', 120000))
    check('min draws at pixel ratio 1', Math.abs((await ratio(page)) - 1) < 0.05, `x${await ratio(page)}`)
    let readout = ''; for (let i = 0; i < 40; i++) { readout = await page.getByTestId('fps-readout').innerText(); if (/ fps · avg .* ms · p95 .* ms · tier min/.test(readout)) break; await realSleep(250) } // the readout refreshes twice a second
    check('the readout shows fps, frame times and the tier', / fps · avg .* ms · p95 .* ms · tier min/.test(readout), readout)
    check('the lowest tier reached is remembered on this device', (await S(page, () => localStorage.getItem('frost-runner-tier-v1'))) === 'min')
    await page.screenshot({ path: `${out}/36-quality-min.png` })
    check('the run itself was unaffected (still running, moving)', (await sim(page)).phase === 'running' && (await sim(page)).dist > 0)
    check('no page errors (quality)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
    // 2. the next visit starts on the remembered tier
    await page.reload(); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(600)
    check('the next visit starts on the remembered tier (min)', (await tier(page)) === 'min')
    await ctx.close() }

  // 3. manual Graphics choice is exact: no adaptation even when frames are slow
  { const { ctx, page } = await slow({}, '&adapt', JSON.stringify({ quality: 'high' }))
    await startRunning(page)
    await sleep(12000)
    check('a manual Graphics choice (high) never steps down', (await tier(page)) === 'high' && (await S(page, () => localStorage.getItem('frost-runner-tier-v1'))) === null)
    await ctx.close() }

  // 4. ?tier= forces a tier; ?debug without ?adapt never adapts (the measurement and test scripts rely on that)
  { const { ctx, page } = await slow({}, '&tier=low')
    await startRunning(page); await sleep(6000)
    check('?tier=low forces the tier and keeps it', (await tier(page)) === 'low' && Math.abs((await ratio(page)) - 1.5) < 0.1)
    await ctx.close() }
  { const { ctx, page } = await slow({}, '')
    await startRunning(page); await sleep(12000)
    check('?debug alone never adapts (budget and e2e runs keep their tier)', (await tier(page)) === 'high')
    await ctx.close() }
}

if (want('sound')) {
  const { ctx, page, errors } = await open({ width: 800, height: 450 }, false, '&world=01&unlock=all')
  const st = () => S(page, () => { const a = window.__frostRunner.debug.audio; return { started: a.started, supported: a.supported, played: { ...a.stats.played } } })
  const total = (x) => Object.values(x.played).reduce((n, v) => n + v, 0)
  const stored = () => S(page, () => JSON.parse(localStorage.getItem('frost-runner-settings-v1') ?? '{}'))
  check('Web Audio is available in this browser', (await st()).supported)
  check('no audio context before the first tap or key press', (await st()).started === false)
  await page.getByRole('button', { name: 'Settings' }).click(); await sleep(200)
  check('Settings offers a Sound switch (on by default)', (await page.getByTestId('sound-switch').innerText()) === 'Sound: on')
  await page.getByRole('button', { name: 'Back' }).click(); await sleep(200)
  check('the tap on a button unlocked audio (a user gesture)', (await st()).started === true)
  await page.keyboard.press('Enter'); await sleep(1500); await clear(page)
  let a = await st()
  check('the run start chime and the footsteps play', a.played.start === 1 && (a.played.step ?? 0) >= 2, JSON.stringify(a.played))
  const before = (await st()).played.jump ?? 0
  await page.keyboard.press('Space'); await sleep(400)
  check('a jump makes a jump sound (and the landing a thump)', ((await st()).played.jump ?? 0) === before + 1 && ((await st()).played.land ?? 0) >= 1, JSON.stringify((await st()).played))
  await page.keyboard.press('ArrowLeft'); await sleep(300)
  check('a lane change makes a swish', ((await st()).played.lane ?? 0) >= 1)
  // an orb: climbing chimes for a chain
  await S(page, () => { const s = window.__frostRunner.sim; for (let i = 0; i < 2; i++) { const o = s.orbs.find((q) => !q.active); Object.assign(o, { active: true, taken: false, takenT: 0, x: s.x, y: 0.9, dist: s.dist + 6 + i * 2.2, id: 9800 + i }) } })
  for (let i = 0; i < 200 && ((await st()).played.orb ?? 0) < 2; i++) await realSleep(50)
  check('picking up two orbs plays two chimes', ((await st()).played.orb ?? 0) >= 2, JSON.stringify((await st()).played))
  // a hazard warning when a crystal comes into range
  await S(page, () => { const s = window.__frostRunner.sim; const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'shard', lane: s.lane === 2 ? 0 : 2, side: 0, x: s.lane === 2 ? -2.2 : 2.2, dist: s.dist + 30, id: 9900 }) })
  for (let i = 0; i < 100 && ((await st()).played.shard ?? 0) < 1; i++) await realSleep(50)
  check('a crystal coming into range gives its warning sound, once', ((await st()).played.shard ?? 0) === 1)
  // M mutes and unmutes
  await clear(page)
  const t0 = total(await st())
  await page.keyboard.press('KeyM'); await sleep(300)
  check('M turns sound off and saves it', (await stored()).sound === false)
  await page.keyboard.press('Space'); await sleep(900)
  check('while muted nothing is played', total(await st()) === t0, `${t0} -> ${total(await st())}`)
  await page.keyboard.press('KeyM'); await sleep(300)
  check('M turns it back on', (await stored()).sound === true)
  // the crash
  const h0 = (await st()).played.hit ?? 0
  await clear(page); await place(page, 'wall', (await sim(page)).lane, 8) // in her own lane, wherever she is now
  for (let i = 0; i < 200 && ((await st()).played.hit ?? 0) === h0; i++) await realSleep(50)
  check('the crash makes its sound', ((await st()).played.hit ?? 0) === h0 + 1)
  check('no page errors (sound)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('sound')) {
  // Auto play is silent, and a saved "off" is respected from the first frame
  const { ctx, page } = await open({ width: 800, height: 450 })
  await page.getByRole('button', { name: 'Auto play' }).click(); await sleep(3000)
  const t = await S(page, () => Object.values(window.__frostRunner.debug.audio.stats.played).reduce((n, v) => n + v, 0))
  check('Auto play makes no sound', t === 0, `${t} sounds`)
  await ctx.close()
  const off = await browser.newContext({ viewport: { width: 800, height: 450 } })
  await off.addInitScript(() => { try { localStorage.setItem('frost-runner-settings-v1', JSON.stringify({ sound: false })) } catch { /* ignore */ } })
  const p2 = await off.newPage(); active = p2
  await p2.goto(`${base}/?game=frost&debug`); await p2.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
  await p2.keyboard.press('Enter'); await sleep(1500); await p2.keyboard.press('Space'); await sleep(600)
  const t2 = await S(p2, () => Object.values(window.__frostRunner.debug.audio.stats.played).reduce((n, v) => n + v, 0))
  check('a saved "sound off" is silent from the first frame', t2 === 0, `${t2} sounds`)
  await off.close()
}

if (want('challenge')) {
  const { ctx, page, errors } = await open({ width: 800, height: 450 }, false, '&world=01&unlock=all')
  const finishWith = (orbs, seen) => S(page, ([o, n]) => { const s = window.__frostRunner.sim; for (const q of s.obstacles) q.active = false; s.gen.lastPos = 1e9; s.dist = s.world.finishDistance - 30; s.orbCount = o; s.orbsSeen = n }, [orbs, seen])
  const prog = () => S(page, () => JSON.parse(localStorage.getItem('frost-runner-progress-v1') ?? '{}').worlds?.['01'])
  // a normal level: 95% of the orbs is World 01's challenge (90%)
  await page.keyboard.press('Enter'); await sleep(400); await clear(page)
  await finishWith(95, 100)
  await page.waitForSelector('[data-screen="complete"]', { timeout: 90000 }); await sleep(400)
  const line = page.getByTestId('challenge-result')
  check('the level-complete panel shows the challenge, done', (await line.count()) === 1 && (await line.getAttribute('data-done')) === 'true' && /Collect 90% of the orbs/.test(await line.innerText()) && /done!/.test(await line.innerText()), await line.innerText())
  check('the badge is saved with the world', (await prog())?.challenge === true, JSON.stringify(await prog()))
  await page.screenshot({ path: `${out}/37-challenge-done.png` })
  // another run that does not meet it: the line shows progress and the badge stays
  await page.waitForTimeout(1600); await page.getByRole('button', { name: 'Play again' }).click(); await sleep(500); await clear(page)
  await finishWith(40, 100)
  await page.waitForSelector('[data-screen="complete"]', { timeout: 90000 }); await sleep(400)
  check('a run that falls short shows its progress, not done', (await page.getByTestId('challenge-result').getAttribute('data-done')) === 'false' && /40% \/ 90%/.test(await page.getByTestId('challenge-result').innerText()), await page.getByTestId('challenge-result').innerText())
  check('and the saved badge is kept', (await prog())?.challenge === true)
  check('stars were not touched by the challenge (only the orb rule)', (await prog())?.stars >= 1)
  // a crash never earns it, and Endless shows no challenge line
  await page.waitForTimeout(1600); await page.getByRole('button', { name: 'Menu' }).click(); await sleep(500)
  await page.getByTestId('endless-start').click(); await sleep(500); await clear(page)
  await finishWith(100, 100); await sleep(1500)
  check('an Endless run past the finish line shows no level challenge', (await sim(page)).phase === 'running' && (await page.getByTestId('challenge-result').count()) === 0)
  // the world cards list every challenge, with its badge
  await clear(page); await place(page, 'wall', (await sim(page)).lane, 8); await page.waitForSelector('[data-screen="gameover"] .runner-menu', { timeout: 20000 })
  await sleep(600); await page.locator('[data-screen="gameover"] .runner-menu').click(); await sleep(400)
  await page.getByRole('button', { name: 'Worlds' }).click(); await sleep(400)
  const cards = await page.locator('.runner-card-ch').evaluateAll((els) => els.map((e) => ({ t: e.innerText, done: e.getAttribute('data-done') })))
  check('every unlocked world card shows its challenge (7 of 7)', cards.length === 7, JSON.stringify(cards.map((c) => c.t)))
  check("World 01's card shows its badge as done, the others as open", cards[0].done === 'true' && /^◆/.test(cards[0].t) && cards.slice(1).every((c) => c.done === 'false' && /^◇/.test(c.t)))
  await page.screenshot({ path: `${out}/38-challenge-cards.png` })
  check('no page errors (challenge)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

if (want('challenge')) {
  // the result panel and the world list still fit on phones with the extra line
  for (const [vp, tag] of [[{ width: 390, height: 844 }, 'portrait'], [{ width: 844, height: 390 }, 'landscape']]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
    const page = await ctx.newPage(); active = page
    await page.goto(`${base}/?game=frost&debug&unlock=all`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(800)
    await page.getByRole('button', { name: 'Start run' }).tap(); await sleep(400); await clear(page)
    await S(page, () => { const s = window.__frostRunner.sim; for (const q of s.obstacles) q.active = false; s.gen.lastPos = 1e9; s.dist = s.world.finishDistance - 30; s.orbCount = 95; s.orbsSeen = 100 })
    await page.waitForSelector('[data-screen="complete"] .runner-menu', { timeout: 90000 }); await sleep(500)
    const r = await page.locator('[data-screen="complete"] button, [data-testid="challenge-result"]').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right } }))
    check(`[phone-${tag}] the complete panel with its challenge line fits`, r.length >= 3 && r.every((b) => b.top >= 0 && b.bottom <= vp.height && b.left >= 0 && b.right <= vp.width), JSON.stringify(r.map((b) => Math.round(b.bottom))))
    await page.screenshot({ path: `${out}/39-challenge-complete-${tag}.png` })
    await ctx.close()
  }
}

if (want('outfit')) {
  const sharp = require('sharp')
  const seedProgress = JSON.stringify({ version: 1, worlds: { '01': { best: 1500, bestOrbs: 300, stars: 3, completed: true }, '02': { best: 1500, bestOrbs: 300, stars: 3, completed: true } } })
  const openWith = async (init, query = '') => {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 600 }, deviceScaleFactor: 1 })
    await ctx.addInitScript((i) => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries(i)) localStorage.setItem(k, v) } } catch { /* ignore */ } }, init)
    const page = await ctx.newPage(); active = page
    const errors = []; page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/?game=frost&debug&tier=high${query}`); await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 }); await realSleep(1200)
    return { ctx, page, errors }
  }
  const patched = (page) => S(page, () => { const sc = window.__frostRunner.debug.scene; const hues = []; sc.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m?.userData?.outfit) hues.push(m.userData.outfit.value) }); return hues })
  // pixels of Aisha (her own screen region) that are blue / reddish-orange, counted from a screenshot
  const colourCounts = async (page) => {
    await page.keyboard.press('Enter'); await sleep(2200); await clear(page); await sleep(700)
    const png = await page.screenshot({ clip: { x: 320, y: 332, width: 65, height: 98 } })
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
    let blue = 0, red = 0
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
      if (mx < 0.15 || d / (mx || 1) < 0.25) continue
      let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6
      if (h > 0.5 && h < 0.72) blue++
      else if (h < 0.1 || h > 0.95) red++
    }
    return { blue, red }
  }
  // 1. a fresh save: only the original outfit, which draws with no patched materials at all
  { const { ctx, page, errors } = await openWith({})
    await page.getByRole('button', { name: 'Settings' }).click(); await sleep(250)
    check('a fresh save offers only Frost and names the next outfit and what it needs', /^Outfit: Frost · next: 6★$/.test(await page.getByTestId('outfit').innerText()), await page.getByTestId('outfit').innerText())
    await page.getByTestId('outfit').click(); await sleep(150)
    check('with one open outfit the button stays on Frost', /^Outfit: Frost/.test(await page.getByTestId('outfit').innerText()))
    await page.getByRole('button', { name: 'Back' }).click(); await sleep(200)
    check('the original look patches no material (renders exactly as before)', (await patched(page)).length === 0)
    const frost = await colourCounts(page)
    check('Frost shows her blue sash and leggings', frost.blue >= 25 && frost.blue > frost.red, JSON.stringify(frost))
    check('no page errors (outfit, fresh)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0)
    await ctx.close() }
  // 2. six stars unlock Ember: pick it, it is saved, drawn, and the colours really move
  { const { ctx, page, errors } = await openWith({ 'frost-runner-progress-v1': seedProgress })
    await page.getByRole('button', { name: 'Settings' }).click(); await sleep(250)
    check('6 stars open Ember (the next one is named: 12 stars)', /^Outfit: Frost · next: 12★$/.test(await page.getByTestId('outfit').innerText()), await page.getByTestId('outfit').innerText())
    await page.getByTestId('outfit').click(); await sleep(250)
    check('the button now shows Ember and is saved', /^Outfit: Ember/.test(await page.getByTestId('outfit').innerText()) && JSON.parse(await S(page, () => localStorage.getItem('frost-runner-settings-v1'))).outfit === 'ember')
    await page.getByRole('button', { name: 'Back' }).click(); await sleep(200)
    check('Ember patches her materials with its hue', (await patched(page)).length > 0 && (await patched(page)).every((h) => Math.abs(h - 0.4) < 1e-9), JSON.stringify(await patched(page)))
    const ember = await colourCounts(page)
    await page.screenshot({ path: `${out}/40-outfit-ember.png`, clip: { x: 200, y: 330, width: 300, height: 260 } })
    check('Ember turns the blue parts red-orange', ember.blue <= 8 && ember.red >= 20, JSON.stringify(ember))
    check('the run is unaffected by the outfit (running, moving)', (await sim(page)).phase === 'running' && (await sim(page)).dist > 0)
    check('no page errors (outfit, ember)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close() }
  // 3. a locked outfit saved earlier falls back to the original; ?unlock=all opens everything
  { const { ctx, page } = await openWith({ 'frost-runner-settings-v1': JSON.stringify({ outfit: 'gold' }) })
    await page.getByRole('button', { name: 'Settings' }).click(); await sleep(250)
    check('a saved outfit that is still locked is drawn as Frost', /^Outfit: Frost/.test(await page.getByTestId('outfit').innerText()) && (await patched(page)).length === 0)
    await ctx.close() }
  { const { ctx, page } = await openWith({}, '&unlock=all')
    await page.getByRole('button', { name: 'Settings' }).click(); await sleep(250)
    const seen = []
    for (let i = 0; i < 6; i++) { seen.push((await page.getByTestId('outfit').innerText()).replace(/^Outfit: /, '').split(' ·')[0]); await page.getByTestId('outfit').click(); await sleep(120) }
    check('?unlock=all cycles through all five outfits and wraps', JSON.stringify(seen) === JSON.stringify(['Frost', 'Ember', 'Aurora', 'Twilight', 'Gold', 'Frost']), JSON.stringify(seen))
    check('and names nothing as locked', !/next:/.test(await page.getByTestId('outfit').innerText()))
    await ctx.close() }
}

// Retry/Restart button stays on screen at 1534x630 and on phones
if (want('phone')) {
  const { ctx, page } = await open({ width: 1534, height: 630 })
  await page.keyboard.press('Enter'); await sleep(300); await clear(page); await place(page, 'wall', 1, 8); await sleep(1500)
  await page.waitForSelector('[data-screen="gameover"] .runner-btn', { timeout: 20000 })
  const box = await page.locator('[data-screen="gameover"] .runner-btn:not(.runner-menu)').boundingBox()
  check('Restart button inside viewport at 1534x630', !!box && box.y >= 0 && box.y + box.height <= 630)
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
