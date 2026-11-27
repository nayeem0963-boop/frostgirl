import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ASSETS, THUMBS, CORE, activeSet, nextWorld, planFor, worldAssets } from '../src/assets/manifest.js'
import { createAssetManager } from '../src/assets/manager.js'
import { runnerThemes, worldIds } from '../src/worlds/runnerThemes.js'

// ---- the manifest ------------------------------------------------------------------------------------------------------
test('every manifest entry points at a real file whose size is the one recorded (so progress totals are true)', () => {
  for (const [id, a] of Object.entries(ASSETS)) assert.equal(statSync(fileURLToPath(a.url)).size, a.bytes, `${id}: update bytes in src/assets/manifest.js`)
  for (const [id, a] of Object.entries(THUMBS)) assert.equal(statSync(fileURLToPath(a.url)).size, a.bytes, `thumb ${id}`)
})

test('what each world needs follows its theme: massif for World 01, wolf for Worlds 02 and 07, a painted horizon for 02-07', () => {
  assert.deepEqual(worldAssets('01'), ['massif'])
  for (const id of worldIds) {
    const t = runnerThemes[id], need = worldAssets(id)
    assert.equal(need.includes('massif'), !t.backdrop, id)
    assert.equal(need.includes('wolf'), !!t.hazards.wolf, id)
    assert.equal(need.includes(`bg-${id}`), !!t.backdrop, id)
    for (const a of need) assert.ok(ASSETS[a], `${id} needs ${a}, which the manifest lacks`)
  }
  assert.deepEqual(CORE, ['aisha', 'spruces', 'orb'])
  assert.equal(activeSet('03').length, 4)
})

test('a world loads only itself and preloads only the next world (never all seven)', () => {
  for (const id of worldIds) {
    const { active, prefetch } = planFor(id)
    const n = nextWorld(id)
    assert.ok(active.length <= 6)
    for (const a of prefetch) assert.ok(worldAssets(n).includes(a) && !active.includes(a))
    for (const other of worldIds) if (other !== id && other !== n) for (const a of worldAssets(other)) if (a.startsWith('bg-')) assert.ok(!active.includes(a) && !prefetch.includes(a), `${id} must not touch ${a}`)
  }
  assert.equal(nextWorld('07'), null)
  assert.deepEqual(planFor('07').prefetch, [])
  const first = planFor('01')
  assert.ok(!first.active.some((a) => a === 'wolf' || a.startsWith('bg-')), 'World 01 does not load the wolf or any painting up front')
})

test('the Worlds screen cards use small thumbnails, not the full paintings', () => {
  const full = Object.entries(ASSETS).filter(([k]) => k.startsWith('bg-')).reduce((n, [, a]) => n + a.bytes, 0)
  const thumbs = Object.values(THUMBS).reduce((n, a) => n + a.bytes, 0)
  assert.ok(thumbs < full / 8, `thumbnails ${thumbs} B vs paintings ${full} B`)
  assert.deepEqual(Object.keys(THUMBS), worldIds)
})

test('no model or image ships unless the manifest knows it', () => {
  const dirs = ['models', 'backgrounds', 'thumbs'].flatMap((d) => readdirSync(new URL(`../src/assets/${d}/`, import.meta.url)).map((f) => `${d}/${f}`))
  const known = new Set([...Object.values(ASSETS), ...Object.values(THUMBS)].map((a) => a.url.split('/src/assets/')[1]))
  const unlisted = dirs.filter((f) => !known.has(f))
  assert.deepEqual(unlisted, ['backgrounds/world-01-frozen-kingdom.webp'], 'only the World 01 painting is unused at runtime (it is kept, not shipped: nothing references it)')
})

// ---- the manager -------------------------------------------------------------------------------------------------------
const MANIFEST = {
  a: { type: 'model', required: true, bytes: 100, url: 'http://t/a' },
  b: { type: 'model', required: true, bytes: 100, url: 'http://t/b' },
  c: { type: 'image', required: false, bytes: 50, url: 'http://t/c' },
  d: { type: 'image', required: false, bytes: 50, url: 'http://t/d' },
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

/** A fake network: `script[url]` is a list of behaviours used in order: 'ok', a status number, 'net' (connection error), 'hang' (never answers until aborted). */
function network(script = {}) {
  const calls = []
  const fetchFn = async (url, { signal }) => {
    const i = calls.filter((c) => c.url === url).length
    const call = { url, signal, aborted: false }
    calls.push(call)
    signal.addEventListener('abort', () => { call.aborted = true })
    const step = (script[url] ?? ['ok'])[Math.min(i, (script[url] ?? ['ok']).length - 1)]
    if (step === 'net') throw new TypeError('fetch failed')
    if (typeof step === 'number') return new Response('x', { status: step })
    if (step === 'hang') return new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    const size = Object.values(MANIFEST).find((m) => m.url === url).bytes
    const half = new Uint8Array(size / 2).fill(1)
    const body = new ReadableStream({ async start(c) { c.enqueue(half); await tick(15); c.enqueue(half); c.close() } })
    return new Response(body, { headers: { 'content-length': String(size) } })
  }
  return { fetchFn, calls }
}
function make(script, over = {}) {
  const net = network(script)
  const disposed = [], decoded = []
  const m = createAssetManager({ manifest: MANIFEST, fetchFn: net.fetchFn, decode: async (id, bytes) => { decoded.push(id); return { id, size: bytes.byteLength } }, dispose: (v) => disposed.push(v.id), backoffMs: [1, 1, 1], stallMs: 40, progressIntervalMs: 1, ...over })
  return { m, net, disposed, decoded }
}

test('two callers asking for the same asset share one download', async () => {
  const { m, net } = make()
  const [x, y] = await Promise.all([m.request('a'), m.request('a')])
  assert.equal(net.calls.length, 1)
  assert.equal(x, y)
  assert.equal(m.stats.dedup, 1)
  await m.request('a')
  assert.equal(net.calls.length, 1, 'already loaded: no new request')
})

test('progress counts bytes as they arrive and ends at the full size', async () => {
  const { m } = make()
  const seen = []
  m.subscribe(() => seen.push(m.status(['a']).fraction))
  await m.request('a')
  const s = m.status(['a'])
  assert.equal(s.fraction, 1); assert.equal(s.ready, true); assert.equal(s.loaded, 100)
  assert.ok(seen.some((f) => f > 0 && f < 1), `saw partial progress: ${seen}`)
})

test('plan: the active set loads, the prefetch waits for it, keeps only bytes, and is decoded without a second download', async () => {
  const { m, net, decoded } = make()
  m.plan({ active: ['a'], prefetch: ['c'] })
  assert.equal(m.state('c'), 'idle', 'the prefetch has not started while the active download runs')
  await m.request('a')
  await tick(20)
  assert.equal(m.state('c'), 'fetched')
  assert.deepEqual(decoded, ['a'], 'a prefetch is not decoded (no GPU memory for a world that is not on screen)')
  const before = net.calls.length
  m.plan({ active: ['c'], prefetch: [] })
  await m.request('c')
  assert.equal(net.calls.length, before, 'the prefetched bytes are used: nothing is downloaded again')
  assert.equal(m.state('c'), 'ready'); assert.deepEqual(decoded, ['a', 'c'])
})

test('changing the plan releases what is no longer needed: decoded values are disposed, bytes dropped, downloads aborted', async () => {
  const { m, net, disposed } = make({ 'http://t/b': ['hang'] })
  m.plan({ active: ['a', 'b'], prefetch: [] })
  await m.request('a'); await tick(5)
  assert.equal(m.state('b'), 'loading')
  m.plan({ active: ['c'], prefetch: [] }) // another world: a is released, b's download is cancelled
  assert.deepEqual(disposed, ['a'])
  assert.equal(m.state('a'), 'idle'); assert.equal(m.state('b'), 'idle')
  assert.ok(net.calls.find((c) => c.url === 'http://t/b').aborted, 'the in-flight request was aborted')
  assert.equal(m.stats.aborts, 1)
  await m.request('c')
  assert.equal(m.state('c'), 'ready')
})

test('an asset released while it is still decoding is disposed, not kept', async () => {
  const disposed = []
  const net = network()
  const m = createAssetManager({ manifest: MANIFEST, fetchFn: net.fetchFn, decode: async (id) => { await tick(60); return { id } }, dispose: (v) => disposed.push(v.id), backoffMs: [1], progressIntervalMs: 1 })
  m.plan({ active: ['a'] })
  await tick(35) // the download (about 17 ms) is done and the decode is under way
  m.plan({ active: [] })
  await tick(80)
  assert.deepEqual(disposed, ['a'])
  assert.equal(m.state('a'), 'idle')
  m.plan({ active: ['a'] }) // and it can be loaded again afterwards
  await m.request('a')
  assert.equal(m.state('a'), 'ready')
})

test('network errors and 5xx are retried with back-off; the asset then loads', async () => {
  const { m, net } = make({ 'http://t/a': ['net', 503, 'ok'] })
  await m.request('a')
  assert.equal(net.calls.length, 3); assert.equal(m.stats.retries, 2); assert.equal(m.state('a'), 'ready')
})

test('a 404 is not retried; the failure is reported, and retry() recovers once the file is there', async () => {
  const { m, net } = make({ 'http://t/a': [404, 'ok'] })
  await assert.rejects(m.request('a'), (e) => e.name === 'AssetError' && e.status === 404)
  assert.equal(net.calls.length, 1)
  assert.equal(m.state('a'), 'error')
  assert.deepEqual(m.status(['a']).failedRequired, ['a'])
  m.retry()
  await tick(20)
  assert.equal(m.state('a'), 'ready')
})

test('retries stop after the limit and report the error', async () => {
  const { m, net } = make({ 'http://t/a': [500] }, { retries: 2 })
  await assert.rejects(m.request('a'), /HTTP 500/)
  assert.equal(net.calls.length, 3)
})

test('a stalled download (no data) is aborted and retried', async () => {
  const { m, net } = make({ 'http://t/a': ['hang', 'ok'] })
  await m.request('a')
  assert.equal(net.calls.length, 2); assert.ok(net.calls[0].aborted); assert.equal(m.stats.retries, 1)
})

test('an optional asset that fails does not block the world; a required one does', async () => {
  const { m } = make({ 'http://t/c': [404], 'http://t/a': [404] })
  m.plan({ active: ['b', 'c'] })
  await tick(30)
  let s = m.status(['b', 'c'])
  assert.equal(s.ready, true, 'the painted horizon is optional'); assert.deepEqual(s.failed, ['c']); assert.deepEqual(s.failedRequired, [])
  m.plan({ active: ['a', 'b'] })
  await tick(30)
  s = m.status(['a', 'b'])
  assert.equal(s.ready, false); assert.deepEqual(s.failedRequired, ['a'])
})

test('read() is the Suspense contract: throws a promise while loading, then returns the value; throws the error on failure', async () => {
  const { m } = make({ 'http://t/b': [404] })
  let thrown
  try { m.read('a') } catch (p) { thrown = p }
  assert.ok(typeof thrown.then === 'function')
  await thrown
  assert.equal(m.read('a').id, 'a')
  try { m.read('b') } catch (p) { thrown = p }
  await thrown
  assert.throws(() => m.read('b'), /could not load b/)
})

test('unknown ids are a programming error, not a network request', () => {
  const { m } = make()
  assert.throws(() => m.plan({ active: ['nope'] }), /unknown asset/)
})
