# Frost Girl

This repository holds three things, chosen by the address (`/` shows a selection screen):

| Address | What it is |
| --- | --- |
| `/?game=frost` | **Frost**, the current game: a 3D three-lane snowy-trail runner with seven worlds. See below. |
| `/?game=frost&mode=expedition` | An earlier third-person mountain expedition prototype, kept as it was. |
| `/?game=original` | The original Frost Girl prototype (spiral track), kept intact. Its notes are in the sections further down. |

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
| dev server only | `?track=straight` (original game), `&skip=...` (expedition), `&viewer=aisha\|wolf\|...` (animation clip viewer) |

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
| `node scripts/runner-e2e.mjs <url>` | browser end-to-end checks of a built, served game (`npm run build && npm run preview`, then the preview address). `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound,music,challenge,outfit,wolf,shard,hole,mist,gust,palace,orbs` runs chosen sections. The full run takes about half an hour on a software renderer. |
| `node scripts/runner-perf.mjs <url> --budget [--world=NN]` | draw calls and triangles against the mobile budget (<= 350k triangles, <= 30 draw calls) |
| `node scripts/net-report.mjs <built-dir> [query]` | bytes over the wire for a first visit, a second visit and an offline reload |
| `node scripts/difficulty-report.mjs [seeds]` | the Auto play bot over every world and difficulty: density, tightness, finish rate (no browser) |
| `node scripts/audio-report.mjs` | renders every sound offline and measures loudness and clipping |

## Standing rules

- World 01 and the original game stay as they were; keep **Auto play** in every version.
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
- **Outfits and the new settings** apply in the runner only, not in the original game.
- **Real devices:** no frame-rate or load-time measurement on a phone yet. Open the game with `&fps` on one and play a minute.

# The original Frost Girl prototype (`?game=original`)

The notes below describe the original prototype, which is kept intact. Obstacles, orbs and a straight-track scene exist in it; the runner above is the current game.

## Development

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use `npm run build` for a production build,
`npm run lint` to check the source, and `npm test` for movement tests.

For comparison, open the development server with `?track=straight` to use the
previous Frozen Kingdom scene and its obstacles and collectibles. This switch
is development-only; production builds use the spiral prototype.

## Performance measurement

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

Click or tap the scene, or tab to the game, to focus keyboard controls. Use
Left/Right or A/D to switch lanes, Up/W/Space to jump, Down/S to slide, and
Escape to pause or resume. The on-screen buttons work with touch and mouse.
Reset returns the runner to the center lane without changing pause state.
Reduced-motion users start with the game paused.
The game also pauses when the browser tab is hidden; resume it when you return.
It also pauses after a rendering stall longer than two seconds to avoid
skipping ahead unexpectedly.

The straight-track scene begins with a short countdown and a 12-second safe running period.
The first obstacles leave the center lane open, and speed increases gradually. Collect
the orbs. Jump over snow barriers and fallen pines, and switch lanes to avoid
tall ice blocks. A collision stops the run; use reset to retry.
Only the crystal count is tracked, and reset clears it.
Crystals follow a spaced lane-to-lane pattern; their ground markers show the
lane to aim for.
The introductory title disappears when the run starts, leaving a small world
label and the gameplay controls visible.
Small recycled snow puffs mark jump takeoff and landing, and a short energy
sparkle marks orb collection. Collisions briefly highlight the screen edge;
the highlight is disabled for reduced-motion users. Feedback pauses with play
and clears on reset. Sound effects are not included yet.

## Structure

- `src/game/` contains the viewport, scene, environment, player, and visual systems.
- `src/game/systems/runnerMovement.js` contains movement state and tuning values.
- `src/game/systems/runSimulation.js` contains countdown, run speed and
  acceleration, learning-period patterns, pooled spawn state, swept collisions,
  and crystal collection. Spacing, reaction time and pacing are configurable.
- `src/worlds/config.js` defines the seven worlds; only World 1 is rendered.
- `src/state/` holds scene UI state, and `src/ui/` contains the overlay.
- `src/styles/` contains the game presentation.
- `public/assets/backgrounds/worlds/` holds the optimized world backgrounds.
- `scripts/` contains the background optimizer and its documentation.

The spiral prototype uses a shared distance-based track frame, a pooled ribbon
road, an upright follow camera and a capped device pixel ratio. The mountain
environment reuses vertical core sections and contoured track-relative snow
shelves with a rock face under the outer edge. It uses instanced pines, sparse
crystals, lakes, clouds and ridges, plus overlapping low-poly distant ranges
whose height is adjusted gradually as the runner climbs. Trees, crystals and
lakes are grounded against the recycled shelf geometry; snow and exposed rock
vary with terrain and altitude. Distant ridge snow also follows the slope, while
subtly shaded shoulders and unevenly spaced, varied-size pines frame the road.
The far ranges have irregular summits and broken snowlines. A procedural
player-centered sky adds a blue gradient, restrained aurora, stars and a moon;
small instanced cloud layers drift slowly without additional lights or shadows.
The low cloud bank recedes gradually as the runner climbs.
Forest and crystal density change
smoothly with distance; waterfalls and a summit landmark occupy fixed positions,
while the route continues climbing beyond the landmark. This remains a stylized
draft: the underlying route is still a repeating spiral rather than traverses
or hairpins, the terrain is not a continuous natural mountainside, and the
summit and waterfalls are not consistently visible from the gameplay camera.
The straight-track scene uses a single WebGL canvas, a small snow particle buffer,
and a capped device pixel ratio. Frozen Kingdom uses a responsive 3D camera, a procedural
sky and distant mountains instead of a gameplay background image. Instanced,
recycled snow segments provide a level, frozen-ice three-lane corridor and
contoured snowbanks. Clusters of branch-shaped, snow-covered pines and bare
trees, mountains, snowy rocks, frozen ponds, cottages, village towers, fences and lanterns move with
the same travel distance as the track, obstacles and crystals; the character's
stride follows that distance too. Segments
recycle behind the camera and reappear
beyond the distance fade. Two reused nearby lantern lights illuminate the
scene without real-time shadows; a small snowfall buffer adds gentle wind drift.
The optimized background images remain
available for future worlds.

The temporary Aisha character preview uses `public/assets/characters/frost-girl/aisha.glb`
and its idle animation, with procedural running and jump poses layered over it.
Set `ACTIVE_CHARACTER` to
`'placeholder'` in `src/game/player/characterConfig.js` to restore the procedural
player. A loading failure reports an error and falls back to that player.

Collectibles use [orb of Chi by themighty808](https://sketchfab.com/3d-models/orb-of-chi-5b9b6b38c601459e95b24184d68e3255),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The game batches and scales the model at runtime, adjusts its material brightness
and opacity, and adds an instanced energy core and halo with rotation, hover and
pulse. The original source GLB
is unchanged; if it fails to load, the game reports the error and uses the
previous diamond collectible.

## The expedition prototype

An earlier third-person 3D mountain expedition lives at `/?game=frost&mode=expedition`. See [docs/FROST.md](docs/FROST.md) for its controls,
architecture, the asset pipeline and the asset inventory. The runner described at the top of this file is what `/?game=frost` opens.
