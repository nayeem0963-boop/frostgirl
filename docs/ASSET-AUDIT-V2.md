# Frost: asset audit and proposal (Asset Management V2, Phase 1)

Read-only audit of `master` at `7e5cf02`. Nothing in the repo was changed, deleted or replaced; the experiments below ran in a scratch folder.
"Frost Girl" was retired in Phase 7.1; the game is now **Frost**, and this document uses that name.

## 1. What was and was not inspected

| Inspected | How |
| --- | --- |
| Every file under `public/` and `src/`, sizes, dimensions, GLB contents (extensions, textures, skins, clips) | file listing, GLB header parse, Pillow |
| Every loader entry point | grep of `src/` |
| Network behaviour of the production build | `scripts/net-report.mjs` and a scripted tour of all seven worlds (Playwright, service worker blocked for the tour) |
| GPU resource growth | `renderer.info.memory` after each world switch |
| Hosting config in the repo | `public/_headers`, `public/sw.js`, `vite.config.js`; no `netlify.toml`, no `functions/`, no Worker or Cloudflare file |

**Not inspected (no access from this environment):** the live site's real response headers and CDN behaviour (the sandbox's proxy blocks `frostgirl.netlify.app`), any Cloudflare configuration or dashboard, any hosting analytics, and therefore the **27.7% non-browser traffic**. Details in section 7.

## 2. Asset inventory (`public/`, shipped as-is to `dist/`)

| Asset | Size | Content | Used by |
| --- | ---: | --- | --- |
| `expedition/alpine-spruces.glb` | 3,590 KB | 32 meshes (LODs), 3 WebP textures 2048² = **2,553 KB** | every world (the forest) |
| `expedition/mountain-massif.glb` | 2,897 KB | 1 mesh, 3 WebP textures 2048² = **2,306 KB** | World 01 only (runner); expedition |
| `expedition/aisha.glb` | 1,533 KB | skinned mesh, 8 clips, 3 WebP textures 1024² = 537 KB | every world |
| `expedition/wolf.glb` | 1,170 KB | skinned mesh, 2 clips, 3 WebP textures 1024² = 732 KB | Worlds 02 and 07 |
| `collectibles/orb_of_chi.glb` | 98 KB | 11 meshes, no textures | every world |
| `backgrounds/worlds/world-01..07-*.webp` | 260-326 KB each, **2,090 KB** total | 941x1672 WebP | World-select cards (all seven) and the backdrop of Worlds 02-07 |
| `favicon.svg`, `icons.svg` | small | **not referenced anywhere** (the page uses `frost.svg`) | unused |
| `backgrounds/worlds/.background-optimizer-cache.json` | small | a build-tool cache, **shipped to production** | unused |
| Audio | none | all sound and music is synthesized in the browser | (0 bytes) |

Total image/model bytes: **11.1 MB**. All four large GLBs already use `EXT_meshopt_compression`, `KHR_mesh_quantization` and `EXT_texture_webp`; Aisha's skeleton and clips are intact. No byte-identical duplicates exist. Textures are 75-85% of every large GLB: geometry is already small.

JS and CSS (runner path): three 699 KB (178 KB gzip), react 214 KB (66), shared loader chunk `Aisha-*.js` 259 KB (81), RunnerGame 89 KB (31), index ~4 KB. The expedition chunk (41 KB) only loads at `?mode=expedition`. Gzip on the GLBs would save only 4-16%.

## 3. Loading behaviour (measured and read from code)

| Question | Finding |
| --- | --- |
| Are all seven worlds loaded at once? | **No** for 3D assets. Worlds 02-07 load their own backdrop on demand; the wolf only for Worlds 02/07; the massif only for World 01. **But** opening the Worlds screen downloads all seven paintings (2.04 MB) as card backgrounds. |
| What gates the start menu? | The menu appears only after the first Suspense boundary resolves: Aisha + spruces + orb (+ wolf in 02/07). With the massif and JS that is **9.18 MB / 14 requests** (World 01), 7.79 MB (World 02), 6.67 MB (World 03). All of it before the player can tap **Start run**. |
| Re-download on restart or revisiting a world? | **No.** Restart x2, and switching back to World 01 and 02: 0 requests (drei caches by URL). |
| Duplicate fetches | Each World 02-07 painting is requested **twice** (once as a CSS card background, once by the 3D backdrop). On a real host the second should be a 304, but the files carry no cache lifetime (below), so it is at least a round trip. |
| GPU resource disposal | **Not released.** GPU texture count rose 21 -> 41 over nine world switches and never fell. Backdrop paintings, the massif and the wolf stay cached for the whole session. Ground geometry is disposed (fixed in 7.2). Estimated (not measured) GPU memory if everything stays resident: ~134 MB for the six 2048² textures plus ~34 MB for the 1024² ones plus ~8 MB per visited painting. |
| Cancellation / error recovery | None: drei's loaders cannot be aborted and a failed load has no retry or fallback screen. |
| Progress display | Only a text "Loading Frost…". |

## 4. Baseline bandwidth (production build, software GL, uncompressed bytes)

| Scenario | Result |
| --- | --- |
| First visit, World 01 (to playable menu) | 9.18 MB, 14 requests |
| Whole cold session: menu, Worlds screen, all seven worlds, restarts | **12.4 MB unique** (9.18 + wolf 1.14 + paintings 2.09), plus 6 repeat painting fetches (~1.8 MB, likely 304 on a real host) |
| Repeat visit (service worker warm) | ~0 MB payload, 5-14 conditional requests |
| Offline reload | works |
| Largest assets | spruces 3.5 MB, massif 2.8 MB, aisha 1.5 MB, wolf 1.1 MB, three.js 0.7 MB |

Per-world marginal cost when switching in-page: 01 = massif 2.8 MB (already part of load); 02 = wolf 1.14 + painting 0.30; 03-06 = 0.27-0.33 MB; 07 = 0.32 MB.

## 5. Caching and delivery (from the repo)

- Host: the repo is Netlify-shaped (`public/_headers`, deploy previews). **No Cloudflare file, no serverless function, no Worker in the repo**, so static files are not routed through functions; I cannot see whether the account puts Cloudflare in front.
- `_headers` marks `/assets/*.js` and `/assets/*.css` `immutable, max-age=1 year` (Vite hashes those names) and `/sw.js` `no-cache`. HTML is left at the host default (revalidated).
- **GLB and WebP files have no cache header and no content hash** (`/assets/expedition/aisha.glb`). They fall back to the host default (revalidate every time). The service worker serves them stale-while-revalidate, so every visit also **re-requests every media file in the background** (a 304 when unchanged). That is the source of the 5-14 requests per repeat visit.
- Because the names are unhashed they cannot safely be made immutable today.

## 6. Experiments (estimates of bytes only; no visual judgement yet)

Re-encoded copies in a scratch folder, nothing written to the repo.

**Backgrounds (941x1672):** now 2,090 KB; WebP q70 = 1,540 KB; **AVIF q55 = 1,167 KB; AVIF q45 = 830 KB**.

**Textures inside the GLBs** (now -> AVIF q50): aisha 537 -> 281 KB, wolf 732 -> 343, spruces 2,553 -> 1,207, massif 2,306 -> 1,047 = **7.1 -> 2.9 MB (about -4.2 MB)**. Halving the 2048² textures to 1024² would give about 0.5 MB each for the base colour (-1 MB each) but changes how World 01 and the forest look, so it needs your decision, not mine.

Caveats: normal maps are the most likely to show artifacts in AVIF; every re-encoded asset must be compared side by side in the game before it replaces anything. three.js r181 reads `EXT_texture_avif` in GLB, but I have not yet tested it with Aisha's skinned mesh.

**KTX2/Basis:** it does **not** reduce download size (ETC1S is about the same as WebP at lower quality, UASTC is larger). Its benefit is GPU memory (about 4-8x less) and faster upload. It needs a Basis encoder (`toktx` or `basisu`, an install) and the Basis transcoder files (a few hundred KB, loaded once). Recommend only if memory on low-end phones is a measured problem.

## 7. The 27.7% non-browser traffic

I cannot investigate it from here and will not guess. Nothing in the repo makes outbound or API calls, so this is traffic **to** the site. What I need: an export from the host or Cloudflare analytics of requests for a recent period, grouped by user agent, ASN/country and path, with status and cache status. Typical benign causes to check against that export: link-preview and chat-app fetchers, search and social crawlers, uptime monitors, Netlify/GitHub deploy-preview checks, Lighthouse or Playwright runs (mine all ran locally against `localhost`, not your site), and service-worker background revalidation if it is counted as non-document traffic.

## 8. Proposed changes (nothing done yet)

Stage A (low risk, no visual change):
1. Stop shipping `.background-optimizer-cache.json`; remove the two unreferenced SVGs (**needs approval to delete**).
2. A small asset manifest module (`src/assets/manifest.js`): id, URL, byte size, worlds that use it, priority.
3. Content-hash GLB/WebP/AVIF through Vite (move from `public/` to `src/assets/` or `?url` imports), then one `_headers` rule `immutable, max-age=1y` for `/assets/*`, HTML and manifest `no-cache`, and update the service worker to cache-first for hashed media. Removes the repeat-visit revalidation requests. Risk: a tab open across a deploy; the SW keeps the old hashed files.
4. Worlds screen: use small thumbnails (about 320 px, about 20 KB each, about 0.15 MB for all seven) derived from the approved paintings, which stay untouched. Saves about 1.9 MB for anyone who opens Worlds and removes the duplicate fetches.

Stage B (loading manager, no visual change):
5. A loader with per-asset reference counts per world, in-flight de-duplication, `AbortController` cancellation, retry with backoff and a visible error with a Retry button, byte-accurate progress, and release (dispose) of the previous world's painting, wolf and massif on transition.
6. Menu first: show the start screen immediately and load Aisha + forest while the player taps Start; preload only the next world's painting (and the wolf when the next world needs it) during a run or the level-complete screen.

Stage C (needs your visual sign-off per asset):
7. AVIF for backgrounds (about -0.9 to -1.3 MB for the full set) with a WebP fallback.
8. AVIF (or a re-tuned WebP) for the GLB textures (about -4 MB), checked side by side; KTX2 only if you want lower GPU memory.

Estimated effect if all stages land (to be re-measured, not promised): first playable about 9.2 -> about 5.5 MB; whole cold session about 12.4 -> about 6 MB; repeat visit 0 MB and about 1 request (HTML) instead of 5-14.

## 9. Decisions needed

1. Approve Stage A and B as described? (Stage A item 1 includes deleting two unused files.)
2. Production URL and permission for me to read its live headers (the sandbox blocks the host), and the analytics export for the 27.7%.
3. Is the live site behind Cloudflare, or Netlify only?
4. For Stage C: may I produce AVIF candidates next to the originals (originals kept) so you can compare, and is a lower-resolution forest/massif texture acceptable, or must they stay 2048²?
