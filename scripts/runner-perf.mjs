// Renderer / CPU measurements for the Frost runner (run against `vite preview`; needs ?debug).
//   node scripts/runner-perf.mjs http://127.0.0.1:4173
// Draw calls and triangles are renderer facts and independent of the GPU. Frame times from headless software
// rendering are NOT representative of real devices; only the JS-side cost of the sim/frame update is meaningful.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const worldArg = process.argv.find((a) => a.startsWith('--world='))?.slice(8) // e.g. --world=02 measures that world
const worldQuery = worldArg ? `&world=${worldArg}&unlock=all` : ''
const budgetMode = process.argv.includes('--budget') // fail (exit 1) when over the mobile budget
// Mobile budget (per frame, 'everything' row): see docs/FROST.md
export const BUDGET = { triangles: 350_000, calls: 30 }
const failures = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] })

async function measure(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile })
  const page = await ctx.newPage()
  await page.goto(`${base}/?game=frost&debug${worldQuery}`)
  await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  await sleep(800)
  await page.keyboard.press('Enter')
  const gt = async (sec) => { const t0 = await page.evaluate(() => window.__frostRunner.sim.time); const end = Date.now() + 120000; while (Date.now() < end) { const t = await page.evaluate(() => { const s = window.__frostRunner.sim; if (s.phase !== 'running') throw new Error('run ended during measurement'); return s.time }); if (t - t0 >= sec) return; await sleep(25) } }
  // park Aisha in the right lane and keep walls (left lane only), a fallen pine and an arch coming so the obstacle meshes are on screen
  const keepBusy = () => page.evaluate(() => { const s = window.__frostRunner.sim; for (const o of s.obstacles) if (o.active && (o.kind !== 'wall' || o.x !== -2.2)) o.active = false; s.gen.lastPos = s.dist + 500
    const live = s.obstacles.filter((o) => o.active).length; if (live < 6) for (let i = 0; i < 6 - live; i++) { const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'wall', x: -2.2, dist: s.dist + 25 + i * 14, id: 5000 + Math.random() }) } })
  await page.evaluate(() => { window.__frostRunner.command('right'); })
  await keepBusy()
  await gt(2)
  await keepBusy()
  const stats = await page.evaluate(async () => {
    const d = window.__frostRunner.debug
    d.gl.info.autoReset = false
    const hide = (filter) => {
      const hidden = []
      d.scene.traverse((o) => { if (filter(o) && o.visible) { o.visible = false; hidden.push(o) } })
      return () => hidden.forEach((o) => { o.visible = true })
    }
    const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })
    // averages over 6 rendered frames: counters are reset first and divided by the number of renders (info.render.frame)
    const read = async (label, filter) => {
      const restore = filter ? hide(filter) : () => {}
      await frames(2)
      const i = d.gl.info
      i.reset()
      const f0 = i.render.frame
      await frames(6)
      const n = Math.max(1, i.render.frame - f0)
      const r = { label, calls: Math.round(i.render.calls / n), triangles: Math.round(i.render.triangles / n), points: Math.round(i.render.points / n), n }
      restore()
      return r
    }
    const out = []
    out.push(await read('everything'))
    out.push(await read('without pines', (o) => o.name === 'forest'))
    out.push(await read('without snowfall', (o) => o.isPoints))
    out.push(await read('without Aisha', (o) => o.isSkinnedMesh))
    out.push(await read('only Aisha', (o) => (o.isMesh || o.isPoints || o.isInstancedMesh) && !o.isSkinnedMesh))
    const savedDist = window.__frostRunner.sim.dist // the extra measurements below move Aisha around; restore her afterwards
    // the same frame with the finish gate in view (it is hidden for most of a level): must stay within the budget too
    window.__frostRunner.sim.dist = window.__frostRunner.sim.world.finishDistance - 40
    await frames(8)
    out.push(await read('everything, finish gate in view'))
    // a world with a signature hazard: measure it on screen too (World 02: two wolves, one of them mid-lunge)
    const sm = window.__frostRunner.sim
    if (sm.world.hazards?.wolf) {
      sm.dist = 0; sm.gen.lastPos = 1e9
      for (const o of sm.obstacles) o.active = false
      const put = (lane, side, ahead, id) => { const o = sm.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'wolf', lane, side, dist: sm.dist + ahead, id, x: side * 5.6 }) }
      put(0, -1, 18, 9101); put(2, 1, 30, 9102)
      await frames(3)
      out.push(await read('everything, wolves in view'))
    }
    if (sm.world.hazards?.shard) { // World 03: two shards, one mid-fall and one landed, with their warnings
      sm.dist = 0; sm.gen.lastPos = 1e9
      for (const o of sm.obstacles) o.active = false
      const put = (lane, ahead, id) => { const o = sm.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'shard', lane, side: 0, dist: sm.dist + ahead, id, x: [-2.2, 0, 2.2][lane] }) }
      put(0, 22, 9201); put(2, 44, 9202)
      await frames(3)
      out.push(await read('everything, shards in view'))
    }
    if (sm.world.hazards?.hole) { // World 04: a cracking patch far ahead, a hole just opening and an open one, with their decals
      sm.dist = 0; sm.gen.lastPos = 1e9
      for (const o of sm.obstacles) o.active = false
      const put = (lane, ahead, id) => { const o = sm.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'hole', lane, side: 0, dist: sm.dist + ahead, id, x: [-2.2, 0, 2.2][lane] }) }
      put(0, 14, 9301); put(1, 22, 9302); put(2, 40, 9303)
      await frames(3)
      out.push(await read('everything, holes in view'))
    }
    { const q = window.__frostRunner.sim; q.dist = savedDist; q.phase = 'running'; q.gen.lastPos = q.dist + 20; for (const o of q.obstacles) o.active = false }
    d.gl.info.autoReset = true
    const i = d.gl.info
    return { out, geometries: i.memory.geometries, textures: i.memory.textures, simMs: d.simMs, heap: performance.memory?.usedJSHeapSize }
  })
  // a longer run to look at memory growth and sim cost
  const heap0 = await page.evaluate(() => performance.memory?.usedJSHeapSize)
  for (let i = 0; i < 8; i++) { await keepBusy(); await gt(1) }
  const heap1 = await page.evaluate(() => performance.memory?.usedJSHeapSize)
  const frames = await page.evaluate(() => window.__frostRunner.debug.frames)
  console.log(`\n== ${name} ${viewport.width}x${viewport.height}`)
  for (const r of stats.out) console.log(`  ${r.label.padEnd(18)} draw calls ${String(r.calls).padStart(3)}   triangles ${String(r.triangles).padStart(7)}   points ${r.points}`)
  const worst = stats.out.filter((r) => r.label.startsWith('everything')).reduce((a, r) => ({ calls: Math.max(a.calls, r.calls), triangles: Math.max(a.triangles, r.triangles) }), { calls: 0, triangles: 0 })
  const all = worst
  const ok = all.triangles <= BUDGET.triangles && all.calls <= BUDGET.calls
  console.log(`  budget (<= ${BUDGET.triangles / 1000}k triangles, <= ${BUDGET.calls} draw calls): ${ok ? 'OK' : 'OVER'}`)
  if (!ok) failures.push(`${name}: ${all.calls} draw calls, ${all.triangles} triangles`)
  console.log(`  geometries ${stats.geometries}, textures ${stats.textures}`)
  console.log(`  JS sim+camera step per frame: ${stats.simMs?.toFixed(3)} ms (moving average)`)
  console.log(`  JS heap: ${(heap0 / 1e6).toFixed(1)} MB -> ${(heap1 / 1e6).toFixed(1)} MB over 8 s of play (${frames} frames rendered)`)
  await ctx.close()
}
await measure('desktop', { width: 1534, height: 630 }, false)
await measure('phone portrait', { width: 390, height: 844 }, true)
await browser.close()
if (failures.length) { console.log(`\nOVER BUDGET: ${failures.join('; ')}`); if (budgetMode) process.exit(1) } else console.log('\nwithin the mobile budget')
