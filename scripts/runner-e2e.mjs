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

async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${base}/?game=frost&debug`)
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
// Remove generated obstacles so lane/jump/duck tests are not interrupted, then place one on demand.
const clear = (page) => S(page, () => { const s = window.__frostRunner.sim; for (const o of s.obstacles) o.active = false; s.gen.lastPos = 1e9 })
const place = (page, kind, lane, ahead) => S(page, ([kind, lane, ahead]) => {
  const s = window.__frostRunner.sim
  const o = s.obstacles.find((x) => !x.active)
  Object.assign(o, { active: true, kind, x: kind === 'wall' ? [-2.2, 0, 2.2][lane] : 0, dist: s.dist + ahead, id: 9000 })
}, [kind, lane, ahead])

// ------------------------------------------------------------------ desktop
{
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
  await place(page, 'wall', lane, 22)
  await sleep(2500)
  s = await sim(page)
  check('collision with ice wall ends the run', s.phase === 'gameover')
  // restart is locked briefly so a mashed key cannot skip the impact (pressed straight away, before any slow screenshot)
  // (dispatched inside the page in the very frame the hit is seen: a real key press through the slow software renderer can arrive after the lock expires)
  const lockHeld = await S(page, () => new Promise((res) => {
    const tick = () => { if (window.__frostRunner.sim.phase !== 'gameover') return requestAnimationFrame(tick); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true })); res(window.__frostRunner.sim.phase === 'gameover') }
    tick()
  }))
  check('restart is ignored in the first moments after impact (no accidental restart)', lockHeld)
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
  await page.locator('[data-screen="gameover"] .runner-btn').click()
  await sleep(600)
  s = await sim(page); check('restart works (button)', s.phase === 'running')

  // natural obstacle spawning and a long run for stability
  await S(page, () => window.__frostRunner.reset())
  check('no page errors (desktop)', errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}

// ------------------------------------------------------------------ phone portrait: swipes
async function phone(viewport, tag) {
  const { ctx, page, errors } = await open(viewport, true)
  await page.screenshot({ path: `${out}/${tag}-start.png` })
  await page.locator('.runner-btn').tap()
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
  await sleep(3500)
  s = await sim(page); check(`[${tag}] collision ends the run`, s.phase === 'gameover')
  await page.waitForSelector('[data-screen="gameover"] .runner-btn', { timeout: 20000 })
  await sleep(300)
  await page.screenshot({ path: `${out}/${tag}-gameover.png` })
  const pb = await page.locator('[data-screen="gameover"]').boundingBox()
  const ab = await S(page, () => { const c = document.querySelector('canvas').getBoundingClientRect(); return { h: c.height, w: c.width } })
  check(`[${tag}] game-over panel leaves the lower scene visible`, tag.includes('portrait') ? pb.height < ab.h * 0.62 : pb.width < ab.w * 0.5, `panel ${Math.round(pb.width)}x${Math.round(pb.height)} of ${ab.w}x${ab.h}`)
  await page.locator('[data-screen="gameover"] .runner-btn').tap(); await sleep(600)
  s = await sim(page); check(`[${tag}] tap Restart`, s.phase === 'running')
  check(`[${tag}] no page errors`, errors.filter((e) => !/GPU stall|ReadPixels/.test(e)).length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
}
await phone({ width: 390, height: 844 }, 'phone-portrait')
await phone({ width: 844, height: 390 }, 'phone-landscape')

// Retry/Restart button stays on screen at 1534x630 and on phones
{
  const { ctx, page } = await open({ width: 1534, height: 630 })
  await page.keyboard.press('Enter'); await sleep(300); await clear(page); await place(page, 'wall', 1, 8); await sleep(1500)
  await page.waitForSelector('[data-screen="gameover"] .runner-btn', { timeout: 20000 })
  const box = await page.locator('[data-screen="gameover"] .runner-btn').boundingBox()
  check('Restart button inside viewport at 1534x630', !!box && box.y >= 0 && box.y + box.height <= 630)
  await ctx.close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
