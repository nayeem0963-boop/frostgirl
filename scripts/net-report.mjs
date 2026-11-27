// Network report (6.7): how many bytes really come over the wire for a first visit, a second visit (service worker warm) and
// a reload with no connection at all. It serves a built folder itself and counts every byte it sends, page and worker alike.
// Usage: node scripts/net-report.mjs <built-dir> [query=?game=frost] [--cold-only]      (needs Playwright, like the other scripts)
// --cold-only: just the first visit (for builds without the service worker, e.g. to measure an older version)
// --no-sw: block the service worker, so the second visit shows what the browser's own HTTP cache does with the built folder's _headers
// The server applies the built folder's `_headers` file the way Netlify does (a `*` matches anything); a path with no rule gets Netlify's default
// `public, max-age=0, must-revalidate` (a conditional request, 304 when unchanged).
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const coldOnly = process.argv.includes('--cold-only')
const noSw = process.argv.includes('--no-sw')
const dir = args[0]
const query = args[1] ?? '?game=frost'
if (!dir) { console.error('usage: node scripts/net-report.mjs <built-dir> [query]'); process.exit(2) }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
let sent = 0; const log = []
const rules = [] // [{ re, headers }] from <dir>/_headers
try {
  let cur = null
  for (const line of (await readFile(join(dir, '_headers'), 'utf8')).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) { cur = { re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), headers: {} }; rules.push(cur) } else { const i = line.indexOf(':'); cur.headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim() }
  }
} catch { /* no _headers file: everything gets the default */ }
const headersFor = (path) => Object.assign({ 'cache-control': 'public, max-age=0, must-revalidate' }, ...rules.filter((r) => r.re.test(path)).map((r) => r.headers))
const server = createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    if (path.endsWith('/')) path += 'index.html'
    let file = join(dir, path)
    if (!(await stat(file).catch(() => null))?.isFile()) file = join(dir, 'index.html')
    const st = await stat(file)
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"` // like a real static host: validators, and a body-less 304 when the copy is current
    if (req.headers['if-none-match'] === etag) { log.push({ path, bytes: 0 }); res.writeHead(304, { etag, ...headersFor(path) }); res.end(); return }
    const body = await readFile(file)
    sent += body.length; log.push({ path, bytes: body.length })
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': body.length, etag, ...headersFor(path) })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, serviceWorkers: noSw ? 'block' : 'allow' })
const page = await ctx.newPage()
const loaded = () => page.waitForSelector('.runner-root[data-ready="true"], .runner-root[data-loaded="true"]:not([data-ready])', { timeout: 300000 }) // playable: the models are in (older builds had no data-ready: their data-loaded meant the same)
const mb = (n) => (n / 1048576).toFixed(2).padStart(6) + ' MB'
const phase = async (label, fn) => {
  sent = 0; log.length = 0
  await fn()
  const atReady = sent // bytes sent by the time the game was playable (the background preload of the next world, if any, comes after)
  await page.waitForTimeout(2500)
  const top = [...log].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map((r) => `${r.path.split('/').pop()} ${(r.bytes / 1048576).toFixed(1)}`).join(', ')
  const n304 = log.filter((r) => r.bytes === 0).length
  console.log(`${label.padEnd(34)} ${mb(sent)}  in ${String(log.length).padStart(2)} requests${atReady !== sent ? ` (${mb(atReady).trim()} when playable)` : ''}${n304 ? ` (${n304} were 304 revalidations)` : ''}${top ? `   (largest: ${top})` : ''}`)
  return sent
}
console.log(`built folder: ${dir}   page: ${query}`)
await phase('1st visit (cold)', async () => { await page.goto(`${base}/${query}`); await loaded() })
if (coldOnly) { await browser.close(); server.close(); process.exit(0) }
if (noSw) { await phase('2nd visit (HTTP cache only)', async () => { await page.goto(`${base}/${query}`); await loaded() }); await phase('3rd visit, new tab', async () => { const p2 = await ctx.newPage(); await p2.goto(`${base}/${query}`); await p2.waitForSelector('.runner-root[data-ready="true"], .runner-root[data-loaded="true"]:not([data-ready])', { timeout: 300000 }); await p2.close() }); await browser.close(); server.close(); process.exit(0) }
await page.evaluate(() => navigator.serviceWorker?.ready.then(() => true)).catch(() => {})
await page.waitForTimeout(1500)
await phase('reload once so the worker caches all', async () => { await page.reload(); await loaded() })
const second = await phase('2nd visit (worker warm)', async () => { await page.reload(); await loaded() })
await ctx.setOffline(true)
let offlineOk = true
await phase('reload with NO connection', async () => { await page.reload(); await loaded().catch(() => { offlineOk = false }) })
const painted = await page.evaluate(() => !!document.querySelector('canvas')).catch(() => false)
console.log(`offline reload shows the game: ${offlineOk && painted ? 'yes' : 'NO'}`)
await browser.close(); server.close()
process.exit(offlineOk && painted ? 0 : 1)
