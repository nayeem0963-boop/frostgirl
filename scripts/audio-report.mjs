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
  const sim = (o = {}) => ({ auto: false, phase: 'running', paused: false, dist: 0, speed: 7.5, grounded: true, x: 0, lane: 1, laneFrom: 0, time: 10, mist: 0, obstacles: [], ...o })
  async function render(play, seconds = 2) {
    class Off extends OfflineAudioContext { constructor() { super(1, rate * seconds, rate); Off.last = this } get state() { return 'running' } }
    const a = createAudio({ AudioContext: Off }); a.unlock(); play(a)
    const buf = await Off.last.startRendering()
    const d = buf.getChannelData(0)
    let peak = 0, sum = 0, last = 0, nan = false
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (Number.isNaN(v)) nan = true; const m = Math.abs(v); if (m > peak) peak = m; sum += v * v; if (m > 0.01) last = i }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), tail: +(last / rate).toFixed(2), nan }
  }
  const out = {}
  for (const e of SOUND_EVENTS) out[e] = await render((a) => a.event(e, sim()))
  for (const k of ['wolf', 'shard', 'hole']) out[`${k} warning`] = await render((a) => { const s = sim({ dist: 0, obstacles: [{ active: true, id: 1, kind: k, x: k === 'wolf' ? 5.6 : 0, dist: 20 }] }); a.frame(s) })
  out.footsteps = await render((a) => { const s = sim(); a.frame(s); s.dist = 1.26 * 3.2; a.frame(s) })
  out['wind bed (1 s in)'] = await render((a) => { a.frame(sim()) }, 6)
  out['worst case: crash + 3 chimes + steps + wind'] = await render((a) => { const s = sim(); a.frame(s); a.event('hit', s); for (let i = 0; i < 3; i++) a.event('orb', { ...s, time: 10 + i * 0.3 }); s.dist = 1.26 * 3.2; a.frame(s); a.event('gust', s); a.event('nearMiss', s) })
  return out
})
await browser.close(); server.close()
const rows = Object.entries(report).map(([name, r]) => ({ sound: name, peak: r.peak, rms: r.rms, 'audible to (s)': r.tail, flag: r.nan ? 'NaN!' : r.peak < 0.02 ? 'SILENT' : r.peak > 0.98 ? 'CLIPS' : '' }))
console.table(rows)
const bad = rows.filter((r) => r.flag && !(r.sound.startsWith('wind') && r.flag === 'SILENT'))
const loud = (n) => report[n].peak
const checks = [
  ['the crash is the loudest single sound', ['jump', 'land', 'lane', 'duck', 'orb', 'nearMiss', 'gust', 'complete', 'start'].every((n) => loud('hit') >= loud(n))],
  ['footsteps are quieter than a jump', loud('footsteps') < loud('jump')],
  ['the worst case stays under 0.85 (headroom before the limiter)', loud('worst case: crash + 3 chimes + steps + wind') <= 0.85],
  ['every one-shot sound peaks between 0.04 and 0.8', ['start', 'jump', 'land', 'lane', 'duck', 'orb', 'nearMiss', 'gust', 'hit', 'complete', 'wolf warning', 'shard warning', 'hole warning', 'footsteps'].every((n) => loud(n) >= 0.04 && loud(n) <= 0.8)],
]
for (const [name, ok] of checks) console.log(ok ? 'PASS ' : 'FAIL ', name)
const failed = bad.length > 0 || checks.some(([, ok]) => !ok)
console.log(failed ? `\nProblems: ${bad.map((r) => `${r.sound} ${r.flag}`).join(', ')}` : '\nNo silent, clipping or NaN sounds.')
process.exit(failed ? 1 : 0)
