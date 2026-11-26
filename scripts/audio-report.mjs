// Audio report (6.2): renders every sound of the runner offline (OfflineAudioContext in headless Chromium, through the real engine and its
// master gain and compressor) and measures it. It cannot tell you whether a sound is pleasant: it checks the things a machine can check.
//   silent?   peak under 0.02: the sound would not be heard
//   clipping? peak over 0.98: the sound would distort
//   a worst-case moment (crash + chimes + footsteps + wind at once) must stay under 1.0
// Usage: node scripts/audio-report.mjs        (needs Playwright, like the other scripts; serves this repository itself)
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const { chromium } = createRequire(import.meta.url)('playwright')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>audio</title>'); return }
    if (!path.startsWith('/src/')) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': extname(path) === '.js' ? 'text/javascript' : 'text/plain' }); res.end(await readFile(join(root, path)))
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${server.address().port}/`)
const report = await page.evaluate(async () => {
  const { createAudio } = await import('/src/runner/audio/engine.js')
  const { RECIPES, SOUND_EVENTS } = await import('/src/runner/audio/sounds.js')
  const rate = 44100
  const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 } // the same noise every run: the numbers are reproducible
  const sim = (o = {}) => ({ auto: false, phase: 'running', paused: false, dist: 0, speed: 7.5, grounded: true, x: 0, lane: 1, laneFrom: 0, time: 10, mist: 0, obstacles: [], ...o })
  async function render(play, seconds = 2) {
    class Off extends OfflineAudioContext { constructor() { super(1, rate * seconds, rate); Off.last = this } get state() { return 'running' } }
    const a = createAudio({ AudioContext: Off, random: seeded(12345) }); a.unlock(); a.setMusicEnabled(false); play(a) // the effects are measured on their own: the music has its own rows below
    const buf = await Off.last.startRendering()
    const d = buf.getChannelData(0)
    let peak = 0, sum = 0, last = 0, nan = false
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (Number.isNaN(v)) nan = true; const m = Math.abs(v); if (m > peak) peak = m; sum += v * v; if (m > 0.01) last = i }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), tail: +(last / rate).toFixed(2), nan }
  }
  // music: the engine schedules a little ahead of the audio clock, so the render is paused every half second to let it do that, like a real-time frame loop
  async function renderMusic(worldId, seconds, extra) {
    class Off extends OfflineAudioContext { constructor() { super(1, rate * seconds, rate); Off.last = this } get state() { return 'running' } }
    const a = createAudio({ AudioContext: Off, random: seeded(12345) }); a.unlock(); a.setWorld(worldId)
    const ctx = Off.last
    const s = sim({ phase: 'running' })
    a.frame(s)
    for (let t = 0.5; t < seconds; t += 0.5) ctx.suspend(t).then(() => { a.frame(s); if (extra && ctx.currentTime >= 6 && ctx.currentTime < 6.5) extra(a, s); ctx.resume() })
    const buf = await ctx.startRendering()
    const d = buf.getChannelData(0)
    let peak = 0, sum = 0, quiet = 0, win = 0, minWin = 1
    for (let i = 0; i < d.length; i++) { const m = Math.abs(d[i]); if (m > peak) peak = m; sum += d[i] * d[i] }
    for (let w = rate * 4; w + rate <= d.length; w += rate) { let e = 0; for (let i = w; i < w + rate; i++) e += d[i] * d[i]; win++; minWin = Math.min(minWin, Math.sqrt(e / rate)) } // after the first 4 s: is there ever a silent second?
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), tail: +seconds.toFixed(2), nan: Number.isNaN(sum), minSecondRms: +minWin.toFixed(4) }
  }
  const out = {}
  for (const e of SOUND_EVENTS) out[e] = await render((a) => a.event(e, sim()))
  for (const k of ['wolf', 'shard', 'hole']) out[`${k} warning`] = await render((a) => { const s = sim({ dist: 0, obstacles: [{ active: true, id: 1, kind: k, x: k === 'wolf' ? 5.6 : 0, dist: 20 }] }); a.frame(s) })
  out.footsteps = await render((a) => { const s = sim(); a.frame(s); s.dist = 1.26 * 3.2; a.frame(s) })
  out['wind bed (1 s in)'] = await render((a) => { a.frame(sim()) }, 6)
  out['worst case: crash + 3 chimes + steps + wind'] = await render((a) => { const s = sim(); a.frame(s); a.event('hit', s); for (let i = 0; i < 3; i++) a.event('orb', { ...s, time: 10 + i * 0.3 }); s.dist = 1.26 * 3.2; a.frame(s); a.event('gust', s); a.event('nearMiss', s) })
  for (const id of ['01', '02', '03', '04', '05', '06', '07']) out[`music, World ${id} (24 s)`] = await renderMusic(id, 24)
  out['music + crash + chimes together'] = await renderMusic('01', 12, (a, s) => { a.event('hit', s); for (let i = 0; i < 3; i++) a.event('orb', { ...s, time: 10 + i * 0.3 }) })
  return out
})
await browser.close(); server.close()
const rows = Object.entries(report).map(([name, r]) => ({ sound: name, peak: r.peak, rms: r.rms, 'audible to (s)': r.tail, flag: r.nan ? 'NaN!' : r.peak < 0.02 ? 'SILENT' : r.peak > 0.98 ? 'CLIPS' : '' }))
const musicRows = Object.entries(report).filter(([n]) => n.startsWith('music, World'))
console.table(rows)
const bad = rows.filter((r) => r.flag && !(r.sound.startsWith('wind') && r.flag === 'SILENT'))
const loud = (n) => report[n].peak
const checks = [
  ['music is quieter than the crash in every world (peak)', musicRows.every(([, r]) => r.peak < loud('hit'))],
  ['music stays soft: peak under 0.3 and RMS under 0.06 in every world', musicRows.every(([, r]) => r.peak < 0.3 && r.rms < 0.06)],
  ['music is never silent after its first bars (every later second is audible)', musicRows.every(([, r]) => r.minSecondRms > 0.003)],
  ['music with a crash and chimes on top stays under 0.9', loud('music + crash + chimes together') <= 0.9],
  ['the crash is the loudest single sound', ['jump', 'land', 'lane', 'duck', 'orb', 'nearMiss', 'gust', 'complete', 'start'].every((n) => loud('hit') >= loud(n))],
  ['footsteps are quieter than a jump', loud('footsteps') < loud('jump')],
  ['the worst case stays under 0.85 (headroom before the limiter)', loud('worst case: crash + 3 chimes + steps + wind') <= 0.85],
  ['every one-shot sound peaks between 0.04 and 0.8', ['start', 'jump', 'land', 'lane', 'duck', 'orb', 'nearMiss', 'gust', 'hit', 'complete', 'wolf warning', 'shard warning', 'hole warning', 'footsteps'].every((n) => loud(n) >= 0.04 && loud(n) <= 0.8)],
]
for (const [name, ok] of checks) console.log(ok ? 'PASS ' : 'FAIL ', name)
const failed = bad.length > 0 || checks.some(([, ok]) => !ok)
console.log(failed ? `\nProblems: ${bad.map((r) => `${r.sound} ${r.flag}`).join(', ')}` : '\nNo silent, clipping or NaN sounds.')
process.exit(failed ? 1 : 0)
