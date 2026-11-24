// Renderer / CPU measurements for the Frost runner (run against `vite preview`; needs ?debug).
//   node scripts/runner-perf.mjs http://127.0.0.1:4173
// Draw calls and triangles are renderer facts and independent of the GPU. Frame times from headless software
// rendering are NOT representative of real devices; only the JS-side cost of the sim/frame update is meaningful.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] })

async function measure(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile })
  const page = await ctx.newPage()
  await page.goto(`${base}/?game=frost&debug`)
  await page.waitForSelector('.runner-root[data-loaded="true"]', { timeout: 180000 })
  await sleep(800)
  await page.keyboard.press('Enter')
  const gt = async (sec) => { const t0 = await page.evaluate(() => window.__frostRunner.sim.time); const end = Date.now() + 120000; while (Date.now() < end) { const t = await page.evaluate(() => { const s = window.__frostRunner.sim; if (s.phase !== 'running') throw new Error('run ended during measurement'); return s.time }); if (t - t0 >= sec) return; await sleep(25) } }
  // park Aisha in the right lane and keep walls (left lane only), a fallen pine and an arch coming so the obstacle meshes are on screen
  const keepBusy = () => page.evaluate(() => { const s = window.__frostRunner.sim; for (const o of s.obstacles) if (o.active && o.kind !== 'wall') o.active = false; s.gen.lastPos = s.dist + 500
    const live = s.obstacles.filter((o) => o.active).length; if (live < 6) for (let i = 0; i < 6 - live; i++) { const o = s.obstacles.find((q) => !q.active); Object.assign(o, { active: true, kind: 'wall', x: -2.2, dist: s.dist + 25 + i * 14, id: 5000 + Math.random() }) } })
  await page.evaluate(() => { window.__frostRunner.command('right'); })
  await keepBusy()
  await gt(2)
  await keepBusy()
  const stats = await page.evaluate(async () => {
    const d = window.__frostRunner.debug
    const count = (filter) => {
      d.gl.info.autoReset = false; d.gl.info.reset()
      const hidden = []
      d.scene.traverse((o) => { if (filter(o) && o.visible) { o.visible = false; hidden.push(o) } })
      return { hidden, off: () => hidden.forEach((o) => { o.visible = true }) }
    }
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const read = async (label, filter) => {
      let h = { off() {} }
      if (filter) h = count(filter)
      d.gl.info.reset(); await frame(); await frame()
      const i = d.gl.info
      const r = { label, calls: Math.round(i.render.calls / 2), triangles: Math.round(i.render.triangles / 2), points: Math.round(i.render.points / 2) }
      h.off(); d.gl.info.autoReset = true
      return r
    }
    const out = []
    out.push(await read('everything'))
    out.push(await read('without pines', (o) => o.name === 'forest'))
    out.push(await read('without snowfall', (o) => o.isPoints))
    out.push(await read('without Aisha', (o) => o.isSkinnedMesh))
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
  console.log(`  geometries ${stats.geometries}, textures ${stats.textures}`)
  console.log(`  JS sim+camera step per frame: ${stats.simMs?.toFixed(3)} ms (moving average)`)
  console.log(`  JS heap: ${(heap0 / 1e6).toFixed(1)} MB -> ${(heap1 / 1e6).toFixed(1)} MB over 8 s of play (${frames} frames rendered)`)
  await ctx.close()
}
await measure('desktop', { width: 1534, height: 630 }, false)
await measure('phone portrait', { width: 390, height: 844 }, true)
await browser.close()
