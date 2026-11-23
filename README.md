# Frost Girl

Frost Girl is a mobile-first 3D endless runner in development. World 1 currently
opens a climbing spiral-track prototype with a procedural mountain environment.
Obstacles and collectibles are
temporarily disabled on this prototype, so runs cannot end from collisions or
earn crystals. Other playable worlds and audio are not implemented yet.

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

## Frost (second game)

The project now hosts two independent games behind a selection screen at `/`:
the original runner above (`/?game=original`) and **Frost — The Frozen
Trail**, a third-person 3D mountain expedition (`/?game=frost`). See
[docs/FROST.md](docs/FROST.md) for controls, architecture, the asset pipeline
and the asset inventory.
