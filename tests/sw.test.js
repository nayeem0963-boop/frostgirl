import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Load public/sw.js in a sandbox with a fake worker scope and a fake Cache Storage + network, then drive its fetch handler.
function loadWorker({ online = true, origin = 'https://frost.test', respond = (url) => ({ url, ok: true, type: 'basic' }) } = {}) {
  const listeners = {}
  const stores = new Map() // cache name -> Map(url -> Response-like)
  const calls = { network: [] }
  const mkResponse = (url, ok = true, type = 'basic') => ({ url, ok, type, clone() { return { ...this } } })
  const caches = {
    open: async (name) => { if (!stores.has(name)) stores.set(name, new Map()); const m = stores.get(name); return { put: async (req, res) => { m.set(req.url, res) }, keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (req) => m.delete(req.url) } },
    match: async (req) => { const url = req.url ?? req; for (const m of stores.values()) if (m.has(url)) return m.get(url); return undefined },
    keys: async () => [...stores.keys()],
    delete: async (k) => stores.delete(k),
  }
  const self = { location: { origin, href: `${origin}/sw.js`, toString() { return `${origin}/sw.js` } }, addEventListener: (n, f) => { listeners[n] = f }, skipWaiting() {}, clients: { claim: async () => {} } }
  let exported
  const ctx = vm.createContext({
    self, caches, URL, Promise, console,
    fetch: async (req) => { calls.network.push(req.url); if (!online) throw new Error('offline'); return { ...respond(req.url), clone() { return { ...this } } } },
    __frostSwTest: (x) => { exported = x },
  })
  ctx.globalThis = ctx
  vm.runInContext(readFileSync('public/sw.js', 'utf8'), ctx)
  const request = (path, { mode = 'no-cors', method = 'GET', host = origin } = {}) => ({ url: `${host}${path}`, mode, method })
  const handle = async (req) => { let p = null; await listeners.fetch({ request: req, respondWith: (x) => { p = x } }); return p ? await p : undefined }
  return { exported, listeners, stores, calls, request, handle, setOnline: (v) => { online = v }, caches, mkResponse }
}

test('which requests the worker touches: pages, hashed bundles and media only, same origin, GET only', () => {
  const { exported } = loadWorker()
  const c = (path, mode = 'no-cors', method = 'GET', origin = 'https://frost.test') => exported.classify(new URL(`https://frost.test${path}`), mode, method, origin)
  assert.equal(c('/', 'navigate'), 'pages')
  assert.equal(c('/?game=frost', 'navigate'), 'pages')
  assert.equal(c('/assets/RunnerGame-BVWA1EWu.js'), 'hashed')
  assert.equal(c('/assets/three-KPVz1gDA.js'), 'hashed')
  assert.equal(c('/assets/App-B0Kq5Bmc.css'), 'hashed')
  assert.equal(c('/assets/aisha-DdMHRkh5.glb'), 'hashed', 'models are content-hashed now')
  assert.equal(c('/assets/world-02-whispering-ice-forest-DEeJxvYe.webp'), 'hashed')
  assert.equal(c('/assets/world-04-frozen-ocean-_upLEQP0.webp'), 'hashed', 'a hash may start with an underscore')
  assert.equal(c('/frost.svg'), 'media', 'a file with no hash in its name is revalidated, not treated as immutable')
  assert.equal(c('/assets/aisha.glb'), 'media', 'an unhashed model (an old bookmark or build) is never treated as immutable')
  assert.equal(c('/sw.js'), null, 'the worker never caches itself')
  assert.equal(c('/assets/foo.js'), null, 'an unhashed script is not treated as immutable')
  assert.equal(c('/assets/RunnerGame-BVWA1EWu.js', 'no-cors', 'POST'), null)
  assert.equal(c('/assets/aisha-DdMHRkh5.glb', 'no-cors', 'GET', 'https://other.test'), null)
})

test('cache names are versioned, and activation removes only old frost caches', async () => {
  const w = loadWorker()
  assert.match(w.exported.VERSION, /^frost-sw-v\d+$/)
  await w.caches.open('frost-sw-v0-media'); await w.caches.open('someone-elses-cache'); await w.caches.open(`${w.exported.VERSION}-media`)
  await w.listeners.activate({ waitUntil: (p) => p })
  await new Promise((r) => setTimeout(r, 5))
  const keys = await w.caches.keys()
  assert.ok(!keys.includes('frost-sw-v0-media'), 'old frost cache deleted')
  assert.ok(keys.includes('someone-elses-cache'), 'other caches untouched')
  assert.ok(keys.includes(`${w.exported.VERSION}-media`), 'current cache kept')
})

test('pages are network first and fall back to the last copy when offline', async () => {
  const w = loadWorker()
  const page = w.request('/?game=frost', { mode: 'navigate' })
  const online = await w.handle(page)
  assert.equal(online.url, page.url); assert.equal(w.calls.network.length, 1)
  await w.handle(w.request('/', { mode: 'navigate' })) // the start page is visited while online too
  w.setOnline(false)
  const offline = await w.handle(page)
  assert.equal(offline.url, page.url, 'a visited page is served from the cache with no connection')
  const other = await w.handle(w.request('/?game=frost&world=03', { mode: 'navigate' }))
  assert.equal(other.url, 'https://frost.test/', 'a page never visited falls back to the cached start page')
})

test('hashed bundles are cache first: the second request never touches the network', async () => {
  const w = loadWorker()
  const req = w.request('/assets/RunnerGame-BVWA1EWu.js')
  await w.handle(req); assert.equal(w.calls.network.length, 1)
  await w.handle(req); assert.equal(w.calls.network.length, 1)
  w.setOnline(false)
  assert.ok(await w.handle(req))
})

test('hashed models and images are cache first too, and a new version of a file replaces the old one in the cache', async () => {
  const w = loadWorker()
  const v1 = w.request('/assets/aisha-DdMHRkh5.glb')
  await w.handle(v1); await w.handle(v1)
  assert.equal(w.calls.network.length, 1, 'the second request is answered from the cache')
  const other = w.request('/assets/wolf-CjYh-HTl.glb')
  await w.handle(other)
  const v2 = w.request('/assets/aisha-ZZZZZZZZ.glb') // a deploy changed the model
  await w.handle(v2)
  const urls = [...w.stores.get(`${w.exported.VERSION}-hashed`).keys()].map((u) => new URL(u).pathname).sort()
  assert.deepEqual(urls, ['/assets/aisha-ZZZZZZZZ.glb', '/assets/wolf-CjYh-HTl.glb'], 'the old aisha is gone, the wolf is untouched')
})

test('media with no hash in its name is stale-while-revalidate: answered from the cache at once, refreshed in the background, works offline', async () => {
  const w = loadWorker()
  const req = w.request('/frost.svg')
  await w.handle(req) // first: from the network, cached
  assert.equal(w.calls.network.length, 1)
  const again = await w.handle(req) // second: cached copy returned, a refresh was started
  assert.equal(again.url, req.url); assert.equal(w.calls.network.length, 2)
  w.setOnline(false)
  const offline = await w.handle(req)
  assert.equal(offline.url, req.url, 'offline: the cached copy')
})

test('failed or opaque responses are never cached; unrelated requests are left alone', async () => {
  const w = loadWorker({ respond: (url) => ({ url, ok: false, type: 'basic' }) })
  assert.equal((await w.handle(w.request('/assets/wolf-CjYh-HTl.glb'))).ok, false, 'the failure is passed on to the page')
  assert.equal(w.stores.size === 0 || [...w.stores.values()].every((m) => m.size === 0), true, 'a 404 / 500 is not stored')
  const opaque = loadWorker({ respond: (url) => ({ url, ok: true, type: 'opaque' }) })
  await opaque.handle(opaque.request('/assets/world-02-AbCdEfGh.webp'))
  assert.equal([...opaque.stores.values()].every((m) => m.size === 0), true, 'an opaque response is not stored')
  const ok = loadWorker()
  assert.equal(await ok.handle(ok.request('/api/other')), undefined, 'not handled: the browser does its normal thing')
  assert.equal(await ok.handle(ok.request('/assets/x-AbCdEfGh.glb', { host: 'https://cdn.example' })), undefined)
  assert.equal(ok.calls.network.length, 0, 'the worker did not even fetch for those')
  assert.equal(ok.stores.size, 0)
})
