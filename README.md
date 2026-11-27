# Frost

Frost is a 3D three-lane snowy-trail runner with seven worlds. It is the only game here: opening the site goes straight to it (the earlier
"Frost Girl" prototype has been retired). One older prototype remains: a third-person mountain expedition at `/?game=frost&mode=expedition`.

# Frost: the runner

Run down a snowy trail as Aisha: switch between three lanes, jump over fallen pines, duck under ice arches and dodge walls. Seven worlds,
each finished by running a set distance (1500-2000 m) and each with its own look and one signature hazard:

| World | Finish | Signature hazard |
| --- | --- | --- |
| 01 Frozen Kingdom | 1500 m | none (the original look: 3D mountains); the trail bends gently and climbs slowly |
| 02 Whispering Ice Forest | 1500 m | a wolf waits at the trail's edge, then lunges into a lane |
| 03 Crystal Mountains | 1600 m | crystal spires fall into lanes (a marker shows the lane first); the trail spirals up the mountain |
| 04 Frozen Ocean | 1700 m | the ice cracks and breaks open: dodge or jump the hole |
| 05 Frosted Dream Desert | 1800 m | banks of dream mist close the view to 10-50 m |
| 06 Sky of Aurora | 1900 m | wind gusts shove Aisha one lane sideways at marked lines |
| 07 Celestial Ice Palace | 2000 m | all of the above, each rarer than at home |

Finishing a world opens the next and earns 1-3 stars (the share of orbs collected). Each world also has an optional challenge (a badge), and
once a world is finished it also offers Endless mode. **Auto play** (a watch-only bot) is on the start screen and doubles as the test harness.
Outfits for Aisha (colour variants) unlock from stars and badges. Everything is cosmetic or progress: there is no shop, no purchase and no
online score.

**The spiral trail.** The trail in Worlds 01 and 03 curves and climbs like the spiral mountain path of the retired Frost Girl prototype (World 03 fully, World 01
gently). It is drawn that way only: the simulation is still a straight three-lane track, so lanes, jumps, slides, collisions, scoring and fairness are identical
on every world, and the runner is always exactly on her lane. The camera turns into the bend, the curve eases in after the start and out before the finish, and
**Reduce motion** makes it gentler and steady (no wobble, no rolling hills). See `src/runner/bend.js` and Phase 7.2 in docs/FROST.md.

**Controls.** Arrow keys or A / D: change lane. Up, W or Space: jump. Down or S: slide. Esc or P: pause. M: sound and music on/off. Enter, Space or R:
start or restart. On touch screens, swipe left, right, up or down, or use the on-screen **LEFT / RIGHT** and **JUMP / SLIDE** buttons (shown on touch screens by default;
the **On-screen buttons** setting forces them on or off). While running, the top of the screen shows the distance (m), the orb counter, your best stars for the world and
**Pause** and **Restart** buttons. Settings (vibration, sound, music, difficulty, outfit, reduce motion, graphics, on-screen buttons,
left-handed layout, high-contrast obstacles) are on the start screen. **Left-handed layout** moves Pause and Restart to the left edge and swaps the two button groups.

## URL flags

| Flag | Effect |
| --- | --- |
| `?world=01` .. `07` | start in that world (a world that is still locked falls back to 01 unless `unlock=all`) |
| `&unlock=all` | open every world, Endless and every outfit (for testing and previews) |
| `&debug` | exposes `window.__frostRunner` (the sim, commands, counters) for the test scripts; the quality tier never adapts in this mode |
| `&fps` | live readout: frames per second, frame times, tier, canvas size and pixel ratio. **Use this to measure a real phone.** |
| `&tier=high\|low\|min` | force a render quality tier (no adaptation) |
| `&adapt` | with `&debug`, let the quality tier adapt anyway |
| `&mode=expedition` | the earlier expedition prototype (with `?game=frost`) |
| dev server only | `&skip=...` (expedition), `&viewer=aisha\|wolf\|...` (animation clip viewer) |

Saved in the browser (`localStorage`): `frost-runner-progress-v1` (bests, stars, badges, Endless bests), `frost-runner-settings-v1`
(settings and outfit), `frost-runner-tier-v1` (the render tier this device was measured to need).

## Commands

```sh
npm install
npm run dev          # development server
npm run check        # lint + unit tests + production build (the same three that CI runs on every pull request)
npm test             # unit tests only (node:test, no browser)
npm run build        # production build
npm run models:compress   # mesh-compress the runtime models (see docs/FROST.md, Phase 6.8)
```

Scripts that need a browser use Playwright, which is **not** a project dependency (install it yourself, or use an environment that has it):

| Script | What it does |
| --- | --- |
| `node scripts/runner-e2e.mjs <url>` | browser end-to-end checks of a built, served game (`npm run build && npm run preview`, then the preview address). `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound,music,challenge,outfit,entry,spiral,assets,wolf,shard,hole,mist,gust,palace,orbs` runs chosen sections. The full run takes about half an hour on a software renderer. |
| `node scripts/runner-perf.mjs <url> --budget [--world=NN]` | draw calls and triangles against the mobile budget (<= 350k triangles, <= 30 draw calls) |
| `node scripts/net-report.mjs <built-dir> [query]` | bytes over the wire for a first visit, a second visit and an offline reload |
| `node scripts/difficulty-report.mjs [seeds]` | the Auto play bot over every world and difficulty: density, tightness, finish rate (no browser) |
| `node scripts/audio-report.mjs` | renders every sound offline and measures loudness and clipping |

## Standing rules

- Keep **Auto play** in every version. (The standalone "Frost Girl" prototype was retired on request; its spiral mountain trail now lives in Frost's Worlds 01 and 03.)
- Birds and skins (outfits) are cosmetic only: the same physics for everyone. No monetization, shops, daily challenges or leaderboard backends.
- Obstacles stay fair: a reaction-time rule bounds every gap (`src/runner/sim/patterns.js`), at every difficulty.
- Mobile budget: at most about 350k triangles and 30 draw calls per frame; 60 fps is the target and 30 the floor.
- Do not claim something was tested if it was not. Real-device frame rates, how the sound and outfits feel, and how hard the challenges are have **not** been measured by a human yet.

## Where things are

- `src/runner/` the runner: `sim/` is the pure fixed-step simulation (obstacle generator, hazards, bot), `scene/` the three.js scenery,
  `audio/` the synthesized sound, plus settings, progress, challenges, outfits, quality tiers and difficulty.
- `src/worlds/runnerThemes.js` the data for each world (colours, hazards, pattern weights, finish distance); `src/worlds/config.js` the registry.
- `src/runner/bend.js` the spiral trail's path (pure maths, tested); `src/runner/scene/bendMaterial.js` the vertex shader patch that draws it.
- `src/expedition/` the earlier expedition prototype. `src/assets/` the models (`models/*.glb`), the world paintings and thumbnails, all content-hashed by Vite and listed in `src/assets/manifest.js`.
- `docs/FROST.md` the full design and test record, newest phase first. `docs/PLAN-PHASE-6.md` the upgrade plan and what became of it.
- `tests/` the unit tests (`npm test`). `scripts/` the browser scripts above and the asset tools.

## Assets and loading

Every model and image lives in `src/assets/` and is listed in `src/assets/manifest.js` (id, size, whether the run needs it, which world uses it). Vite gives
each file a content hash (`aisha-DdMHRkh5.glb`), so `public/_headers` can cache everything under `/assets/` for a year as `immutable`; the page and the service worker
are always revalidated. `src/assets/manager.js` downloads, de-duplicates, retries and cancels; `src/assets/gpu.js` decodes and frees GPU memory.

- The start menu shows as soon as the page is up; the models download behind it, with a progress line, and **Start run** enables when they are in.
- A world loads only what it uses (World 01: the 3D massif; Worlds 02 and 07: the wolf; Worlds 02-07: their painted horizon). The core models (Aisha, the forest, the orb) are loaded once.
- Once the player is 35% through a level (or has finished it) the **next** world's files are fetched quietly, as bytes only. Leaving a world frees its models and textures.
- A required file that fails is retried three times (400 ms, 1.2 s, 3 s) and then the start screen offers **Retry**; a failed painted horizon is optional (the world plays without it).
- The Worlds screen shows small thumbnails (`src/assets/thumbs/`, made by `scripts/make-thumbnails.mjs` from the paintings, which stay as they are).
- To add an asset: put the file in `src/assets/`, add it to the manifest (with its byte size: `tests/assets.test.js` checks it), and read it with `useAsset('id')` inside a component.
- Measure: `npm run build && node scripts/net-report.mjs dist` (first visit, repeat visit, offline; `--no-sw` shows the browser's own cache); add `?world=03&unlock=all` as a second argument for another world.

## Open decisions and known gaps

- **Stars and difficulty:** stars and bests are recorded the same on every difficulty level. Options: leave it, cap Easy at 2 stars, or keep separate bests per level.
- **Challenge goals and outfit requirements** are first guesses, not validated against a human player.
- **Music is synthesized and unheard by me** (a calm generative loop per world; see Phase 7.0 in docs/FROST.md). **Textures** of the spruces and the World 01 massif are 2048-pixel WebP; lowering them would change how World 01 looks.
- **Real devices:** no frame-rate or load-time measurement on a phone yet. Open the game with `&fps` on one and play a minute.

## Measuring frame rate on a device


Compare production builds on the same device, browser, viewport and pixel ratio.
Warm up the scene and keep the game visible and focused. Record several runs of
at least 30 seconds; do not treat a hidden, throttled or interrupted sample as
gameplay performance. In the browser console, the following waits five seconds
to allow focus to return to the game, then reports frame pacing:

```js
setTimeout(() => {
  let start, previous
  let invalid = false
  const frames = []
  function sample(now) {
    if (start === undefined) start = now
    if (previous !== undefined) frames.push(now - previous)
    previous = now
    invalid ||= document.hidden || !document.hasFocus()
    if (now - start < 30000) {
      requestAnimationFrame(sample)
      return
    }
    const total = frames.reduce((sum, frame) => sum + frame, 0)
    const slowest = frames.slice().sort((a, b) => b - a)
      .slice(0, Math.max(1, Math.ceil(frames.length * 0.01)))
    const slowMean = slowest.reduce((sum, frame) => sum + frame, 0) / slowest.length
    console.table({
      validFocusAndVisibility: !invalid,
      frames: frames.length,
      averageFPS: frames.length * 1000 / total,
      averageFrameMs: total / frames.length,
      onePercentLowFPS: 1000 / slowMean,
    })
  }
  requestAnimationFrame(sample)
}, 5000)
```

Use the browser performance profiler to inspect main-thread work and frame
intervals; use WebGL tooling or renderer statistics for draw calls and
triangles. GPU timer queries, where supported, measure GPU time separately from
CPU submission. Check normal play with snowfall and record brief collection
and collision effects separately. Paused gameplay uses on-demand rendering, so
an animation-frame counter is not a measurement of paused render FPS. Responsive
viewport emulation is not a substitute for testing on mobile hardware.

## Credits

The orbs use [orb of Chi by themighty808](https://sketchfab.com/3d-models/orb-of-chi-5b9b6b38c601459e95b24184d68e3255),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The game batches the model and restyles its materials at run time (they
are nearly transparent against a dark background and would vanish against snow); the source GLB file itself is unchanged.

## The expedition prototype

An earlier third-person 3D mountain expedition lives at `/?game=frost&mode=expedition`. See [docs/FROST.md](docs/FROST.md) for its controls,
architecture, the asset pipeline and the asset inventory. The runner described at the top of this file is what `/?game=frost` opens.
