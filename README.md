# Frost

Frost is a 3D three-lane snowy-trail runner with seven worlds. It is the only game here: opening the site goes straight to it (the earlier
"Frost Girl" prototype has been retired). One older prototype remains: a third-person mountain expedition at `/?game=frost&mode=expedition`.

# Frost: the runner

Run down a snowy trail as Aisha: switch between three lanes, jump over fallen pines, duck under ice arches and dodge walls. Seven worlds,
each finished by running a set distance (1500-2000 m) and each with its own look and one signature hazard:

| World | Finish | Signature hazard |
| --- | --- | --- |
| 01 Frozen Kingdom | 1500 m | none (the original look: 3D mountains) |
| 02 Whispering Ice Forest | 1500 m | a wolf waits at the trail's edge, then lunges into a lane |
| 03 Crystal Mountains | 1600 m | crystal spires fall into lanes (a marker shows the lane first) |
| 04 Frozen Ocean | 1700 m | the ice cracks and breaks open: dodge or jump the hole |
| 05 Frosted Dream Desert | 1800 m | banks of dream mist close the view to 10-50 m |
| 06 Sky of Aurora | 1900 m | wind gusts shove Aisha one lane sideways at marked lines |
| 07 Celestial Ice Palace | 2000 m | all of the above, each rarer than at home |

Finishing a world opens the next and earns 1-3 stars (the share of orbs collected). Each world also has an optional challenge (a badge), and
once a world is finished it also offers Endless mode. **Auto play** (a watch-only bot) is on the start screen and doubles as the test harness.
Outfits for Aisha (colour variants) unlock from stars and badges. Everything is cosmetic or progress: there is no shop, no purchase and no
online score.

**Controls.** Arrow keys or A / D: change lane. Up, W or Space: jump. Down or S: duck. Esc or P: pause. M: sound and music on/off. Enter, Space or R:
start or restart. On touch screens, swipe left, right, up or down. Settings (vibration, sound, music, difficulty, outfit, reduce motion, graphics,
left-handed layout, high-contrast obstacles) are on the start screen.

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
| `node scripts/runner-e2e.mjs <url>` | browser end-to-end checks of a built, served game (`npm run build && npm run preview`, then the preview address). `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound,music,challenge,outfit,entry,wolf,shard,hole,mist,gust,palace,orbs` runs chosen sections. The full run takes about half an hour on a software renderer. |
| `node scripts/runner-perf.mjs <url> --budget [--world=NN]` | draw calls and triangles against the mobile budget (<= 350k triangles, <= 30 draw calls) |
| `node scripts/net-report.mjs <built-dir> [query]` | bytes over the wire for a first visit, a second visit and an offline reload |
| `node scripts/difficulty-report.mjs [seeds]` | the Auto play bot over every world and difficulty: density, tightness, finish rate (no browser) |
| `node scripts/audio-report.mjs` | renders every sound offline and measures loudness and clipping |

## Standing rules

- Keep **Auto play** in every version. (The standalone "Frost Girl" prototype was retired on request; its spiral mountain trail is being brought into Frost.)
- Birds and skins (outfits) are cosmetic only: the same physics for everyone. No monetization, shops, daily challenges or leaderboard backends.
- Obstacles stay fair: a reaction-time rule bounds every gap (`src/runner/sim/patterns.js`), at every difficulty.
- Mobile budget: at most about 350k triangles and 30 draw calls per frame; 60 fps is the target and 30 the floor.
- Do not claim something was tested if it was not. Real-device frame rates, how the sound and outfits feel, and how hard the challenges are have **not** been measured by a human yet.

## Where things are

- `src/runner/` the runner: `sim/` is the pure fixed-step simulation (obstacle generator, hazards, bot), `scene/` the three.js scenery,
  `audio/` the synthesized sound, plus settings, progress, challenges, outfits, quality tiers and difficulty.
- `src/worlds/runnerThemes.js` the data for each world (colours, hazards, pattern weights, finish distance); `src/worlds/config.js` the registry.
- `src/expedition/` and `src/game/` the earlier prototypes. `public/assets/` models (`expedition/*.glb`), world paintings and the orb.
- `docs/FROST.md` the full design and test record, newest phase first. `docs/PLAN-PHASE-6.md` the upgrade plan and what became of it.
- `tests/` the unit tests (`npm test`). `scripts/` the browser scripts above and the asset tools.

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
