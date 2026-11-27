// The asset manager (Asset Management V2). Plain JavaScript with injected `fetchFn`, `decode` and `dispose`, so it is unit-tested in Node
// (tests/assets.test.js) and wired to three.js in assets/index.js. It owns, per asset id:
//   - the download: one request per asset however many callers ask (de-duplication), byte progress, a stall timeout, retry with
//     back-off on network errors / 5xx / 408 / 429 (never on other 4xx), and cancellation (an AbortController per download);
//   - the decoded value (a glTF scene, a texture) and its release: `release` frees the GPU resources through `dispose`;
//   - a plan: `plan({ active, prefetch })` says what the current world needs (loaded now, kept) and what to fetch quietly for the next
//     world (bytes only, held until that world is activated, started only while nothing active is downloading). Whatever is in neither
//     list is released: a download in flight is aborted, a decoded value is disposed, prefetched bytes are dropped.
// An asset is in one state at a time: idle -> loading -> (fetched, for a prefetch) -> ready, or error (after the retries; `retry()` tries again).

export class AssetError extends Error {
  constructor(id, cause, status = 0) { super(`could not load ${id}: ${cause?.message ?? cause}`); this.name = 'AssetError'; this.id = id; this.status = status; this.cause = cause }
}
class HttpError extends Error { constructor(status) { super(`HTTP ${status}`); this.name = 'HttpError'; this.status = status } }
class StallError extends Error { constructor() { super('no data received'); this.name = 'StallError' } }
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' })

const retriable = (err) => err instanceof StallError || err?.name === 'TypeError' || err?.message === 'empty response' || (err instanceof HttpError && (err.status >= 500 || err.status === 408 || err.status === 429))

const defaultSleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(abortError())
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()) }, { once: true })
})

export function createAssetManager({
  manifest, fetchFn = (...a) => fetch(...a), decode, dispose = () => {},
  retries = 3, backoffMs = [400, 1200, 3000], stallMs = 20000, sleep = defaultSleep, progressIntervalMs = 100, releaseDelayMs = 0,
} = {}) {
  const entries = new Map()
  const listeners = new Set()
  const stats = { fetches: 0, bytes: 0, retries: 0, aborts: 0, dedup: 0, decoded: 0, disposed: 0, failures: 0 }
  let version = 0, timer = null

  const flush = () => { timer = null; version++; for (const l of [...listeners]) l() }
  const bump = () => { if (timer) { clearTimeout(timer); timer = null } flush() } // state changes notify at once
  const bumpSoon = () => { if (!timer) { timer = setTimeout(flush, progressIntervalMs); timer.unref?.() } } // byte progress is throttled

  function entryOf(id) {
    let e = entries.get(id)
    if (!e) {
      const meta = manifest[id]
      if (!meta) throw new Error(`unknown asset "${id}"`)
      e = { id, meta, state: 'idle', want: 'none', loaded: 0, total: meta.bytes, bytes: null, value: null, controller: null, wait: null, promise: null, error: null, attempts: 0 }
      entries.set(id, e)
    }
    return e
  }
  const activeLoading = () => [...entries.values()].some((e) => e.state === 'loading' && e.want === 'active')

  async function fetchOnce(e, outer) {
    const ctl = new AbortController()
    const onAbort = () => ctl.abort()
    outer.addEventListener('abort', onAbort, { once: true })
    let stalled = false, stallTimer = null
    const arm = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => { stalled = true; ctl.abort() }, stallMs); }
    try {
      arm()
      stats.fetches++
      const res = await fetchFn(e.meta.url, { signal: ctl.signal })
      if (!res.ok) throw new HttpError(res.status)
      e.total = Number(res.headers?.get?.('content-length')) || e.meta.bytes
      const reader = res.body?.getReader?.()
      if (!reader) { const buf = await res.arrayBuffer(); e.loaded = buf.byteLength; return buf }
      const chunks = []
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        arm()
        chunks.push(value); received += value.byteLength
        e.loaded = received; bumpSoon()
      }
      if (received === 0) throw new Error('empty response')
      const out = new Uint8Array(received)
      let at = 0
      for (const c of chunks) { out.set(c, at); at += c.byteLength }
      return out.buffer
    } catch (err) {
      if (outer.aborted) throw abortError()
      if (stalled) throw new StallError()
      throw err
    } finally {
      clearTimeout(stallTimer)
      outer.removeEventListener('abort', onAbort)
    }
  }

  async function download(e, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        e.loaded = 0
        const buf = await fetchOnce(e, signal)
        stats.bytes += buf.byteLength
        return buf
      } catch (err) {
        if (signal.aborted || err?.name === 'AbortError') throw abortError()
        if (!retriable(err) || attempt >= retries) throw new AssetError(e.id, err, err?.status ?? 0)
        stats.retries++; e.attempts = attempt + 1; bump()
        await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 1000, signal)
      }
    }
  }

  function run(e) {
    e.state = 'loading'; e.error = null
    const ctl = (e.controller = new AbortController())
    const job = (async () => {
      const bytes = e.bytes ?? (await download(e, ctl.signal))
      if (ctl.signal.aborted) throw abortError()
      if (e.want !== 'active') { e.bytes = bytes; e.state = 'fetched'; return null } // a prefetch: keep the bytes, decode when the world becomes active
      const value = await decode(e.id, bytes, e.meta)
      if (ctl.signal.aborted) { dispose(value, e.meta); stats.disposed++; throw abortError() }
      stats.decoded++
      e.value = value; e.bytes = null; e.loaded = e.total; e.state = 'ready'
      return value
    })()
    e.promise = job
    e.wait = job.then(() => {}, () => {}) // for Suspense: resolves whatever happens, the reader then sees the state
    job.catch((err) => {
      if (e.controller !== ctl) return // superseded
      if (err?.name === 'AbortError') { e.state = 'idle'; e.loaded = 0 } else { e.state = 'error'; e.error = err; stats.failures++ }
    }).finally(() => { if (e.controller === ctl) { e.controller = null; bump(); pump() } })
    bump()
    return job
  }

  function start(id, want) {
    const e = entryOf(id)
    if (want === 'active') { if (e.want === 'active' && e.state === 'loading') stats.dedup++; e.want = 'active' } else if (e.want === 'none') e.want = 'prefetch'
    if (e.state === 'ready' || e.state === 'error') return e
    if (e.state === 'loading') return e // already on its way: every caller shares this one download
    if (e.state === 'fetched') { if (e.want === 'active') run(e); return e }
    if (e.want === 'prefetch' && activeLoading()) return e // queued: prefetches wait for the active downloads
    run(e)
    return e
  }
  function pump() {
    if (activeLoading()) return
    for (const e of entries.values()) if (e.want === 'prefetch' && e.state === 'idle') run(e)
  }

  function release(id) {
    const e = entries.get(id)
    if (!e || (e.state === 'idle' && e.want === 'none')) return
    e.want = 'none'
    if (e.state === 'loading') { stats.aborts++; e.controller?.abort(); e.controller = null } // detached: the aborted job can no longer touch this entry
    if (e.value) { dispose(e.value, e.meta); stats.disposed++; e.value = null }
    e.bytes = null; e.state = 'idle'; e.loaded = 0; e.error = null
    bump()
  }

  const api = {
    /** Set what the current world needs now and what to fetch quietly for the next one; everything else is released. */
    plan({ active = [], prefetch = [] } = {}) {
      const keep = new Set([...active, ...prefetch])
      for (const id of [...entries.keys()]) {
        if (keep.has(id)) continue
        const e = entries.get(id)
        if (releaseDelayMs > 0 && e.state !== 'loading' && e.state !== 'idle') { // freeing GPU memory waits a moment so the scene has stopped drawing it (a freed texture that is still drawn is uploaded again)
          e.want = 'none'
          const t = setTimeout(() => { if (e.want === 'none') release(id) }, releaseDelayMs); t.unref?.()
        } else release(id)
      }
      for (const id of active) start(id, 'active')
      for (const id of prefetch) if (!active.includes(id)) { const e = entryOf(id); if (e.want === 'active') e.want = 'prefetch'; start(id, 'prefetch') } // a world that is no longer active becomes a prefetch (decoded value kept)
      pump()
      bump()
    },
    /** Ad-hoc request (a component asking for something the plan does not list): resolves with the decoded value. */
    request(id) {
      const e = start(id, 'active')
      if (e.state === 'ready') return Promise.resolve(e.value)
      if (e.state === 'error') return Promise.reject(e.error)
      return e.promise
    },
    /** For React Suspense: the value, or throws a promise (still loading) or the error (failed). */
    read(id) {
      const e = entryOf(id)
      if (e.state === 'ready') return e.value
      if (e.state === 'error') throw e.error
      start(id, 'active')
      throw e.wait ?? Promise.resolve()
    },
    release,
    /** Try again every failed asset (or just `id`): used by the Retry button. */
    retry(id) {
      for (const e of entries.values()) if (e.state === 'error' && (!id || e.id === id)) { e.state = 'idle'; e.attempts = 0; start(e.id, e.want === 'none' ? 'active' : e.want) }
      bump()
    },
    /** Progress and readiness of a set of assets. `ready` ignores an optional asset that failed (the game runs without that scenery). */
    status(ids) {
      let loaded = 0, total = 0, ready = true, loading = false
      const failed = [], failedRequired = []
      for (const id of ids) {
        const e = entryOf(id)
        total += e.total
        if (e.state === 'ready') { loaded += e.total; continue }
        loaded += Math.min(e.loaded, e.total)
        if (e.state === 'error') { failed.push(id); if (e.meta.required) { failedRequired.push(id); ready = false } } else { ready = false; if (e.state === 'loading') loading = true }
      }
      return { ready, loading, loaded, total, fraction: total ? loaded / total : 1, failed, failedRequired }
    },
    state: (id) => entryOf(id).state,
    value: (id) => entryOf(id).value,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    getVersion: () => version,
    stats,
    /** Release everything (tests, hot reload). */
    dispose() { for (const id of [...entries.keys()]) release(id) },
  }
  return api
}
