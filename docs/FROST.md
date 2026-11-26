# Frost — Phase 6.4: first-run hint and settings

None of these settings touches the simulation (speed, collisions, scoring, generator), so scores stay comparable.

- **First-run hint** (`settings.js`): a small "Swipe or use the arrow keys..." pill on the very first run. It goes away with the
  first jump (or after 110 m, about 15 s, so it never lingers), is remembered, and is never shown in Auto play.
- **Settings sheet** (start screen, "Settings"; Esc or Back closes it), saved in `localStorage` (`frost-runner-settings-v1`;
  bad or hand-edited values fall back per field; the 6.3 vibration choice is carried over once):
  - Vibration on/off (only listed when the device supports it).
  - Reduce motion: auto (follows the system) / on / off. On = no impact shake, no flash, no pop-in animations.
  - Graphics: auto (from screen size and pointer) / low / high.
  - Left-handed layout: the pause button moves to the left edge.
  - High-contrast obstacles: a warm amber glow on walls, fallen pines, arches and crystal spires.
    The wolf and the ice hole are **not** covered by this yet.
- **Already in place, checked:** the run pauses when the tab is hidden (`visibilitychange`); `prefers-reduced-motion` is honoured.
- The vibration switch moved from the start screen into the sheet, so the start screen stays short on phones in landscape.

## Tests (run here)
- `npm test`: 204/204 (new `tests/settings.test.js`, 8 tests: defaults, round trip, bad/hand-edited saves, 6.3 migration,
  choice cycling, reduce-motion and quality resolution, hint rules).
- `ONLY=settings,feel`: 26/26 in headless Chrome (hint shown, goes with the first jump, remembered, not shown again; every
  setting changes and is saved and survives a reload; amber glow value read from the obstacle material; left-handed pause
  button on the left; the sheet and the start screen fit in the viewport at 800x450, 390x844 and 844x390).
- Regression: `ONLY=desktop,phone,auto,settings,feel` 93/93 (includes the Retry/Restart button inside the viewport at 1534x630 and on phones).
- Not verified: colour-blind simulation of the amber glow (chosen for hue and luminance difference against snow/ice, not
  measured with a simulator); screen-reader pass; real-device feel.

# Frost — Phase 6.3: game feel and clearer warnings

Cosmetic feedback only: nothing here changes scoring, collisions, speed or the generator, and the World 01 pins still pass.

- **Near miss.** When an obstacle comes level with Aisha without touching her and the gap is under `NEAR_MISS = 0.3 m`
  (sideways, or above/below for a jump over a ridge or a duck under an arch), the sim emits one `nearMiss` event
  (`clearance()` in `sim/sim.js`; each obstacle is judged once). The screen shows a short "Close!" under the score (a fade,
  also fine with reduced motion).
- **Haptics** (`src/runner/feel.js`): short vibration patterns for an orb (8 ms), near miss (14 ms), gust, hit and level
  complete, via `navigator.vibrate` where the device has it (Android phones; iOS Safari and desktop do not). A
  "Vibration: on/off" switch on the start screen (only shown when the device supports it) is remembered in
  `localStorage` (`frost-runner-haptics-v1`). Never in Auto play.
- **Gust telegraph.** The ground marker was a 4 m deep decal that collapsed into a thin line from the low chase camera. It is now 14 m
  deep with a deep-teal band and white-edged chevrons (normal blending: additive washed out on pale snow). It is clearly
  visible in a headless still at about 45 m.
- **Not done, on purpose:** a restart countdown. Every run already starts with 3.5 s of clear road (`RUN.safeSeconds`), so a countdown would
  only add waiting; and the finish-line celebration already uses the Meshy `celebrate` clip since Phase 3.

## Tests (run here)
- `npm test`: 196/196 (new `tests/feel.test.js`, 8 tests: clearance maths, one nearMiss per close pass, none for a wide
  pass or a hit, sim unchanged by consuming events, bot still finishes Worlds 01 and 07, haptic patterns, setting and
  broken-storage handling).
- `ONLY=feel node scripts/runner-e2e.mjs <url>`: 9/9 with a stubbed `navigator.vibrate` (the vibration itself was not felt:
  headless Chrome has no motor): Vibration switch, "Close!" and its single light pulse, fade-out, hit pattern, switch off
  and saved, survives reload, Auto play never vibrates.
- `ONLY=desktop,phone,auto,gust`: 76/76, including the Retry/Restart button inside the viewport at 1534x630 and on phones.
- Budget `--world=06`: gust line in view 23 draw calls / 231k triangles desktop, 22 / 187k phone portrait. Within budget.
- Not verified: how the vibration patterns feel on a real phone, and the "Close!" timing by hand.

# Frost — Phase 6.0: the Meshy Aisha in the original game

The original Frost Girl game (`?game=original`) drew a different character from the runner: the Sketchfab "Aisha" preview
(127 joints, one clip, animated by a procedural rig), with a cone-and-capsule figure as the load-failure fallback. It now
draws the **Meshy-rigged Aisha** (`public/assets/expedition/aisha.glb`, the same model and clips as the runner).

- `src/game/player/MeshyAisha.jsx`: plays her real clips. `run` at a rate that follows the track speed, `idle` before the
  start, the jump pose scrubbed by the jump's progress (it always matches the arc), the crouch pose for a slide. It draws
  only: lanes, jump height, collisions and scoring are unchanged. Cosmetic only, as for every skin.
- `src/game/player/meshyAishaConfig.js`: the pure rules (state choice, run rate, scale 0.95, facing), unit tested.
- `characterConfig.js`: `ACTIVE_CHARACTER = 'aisha'` is the Meshy one; `'aisha-sketchfab'` selects the earlier preview and
  `'placeholder'` the cone figure. The error boundary still falls back to the placeholder if the model fails to load.
- The runner (World 01-07) is untouched.

## Tests (run here)
- `npm test`: 188/188 (new `tests/meshyAvatar.test.js`: active character, clips exist in the GLB, state mapping, run rate, facing and size).
- Manual check, headless Chrome, `?game=original` at 900x560: loaded with no page errors, runs on the track, shadow under her
  feet, size close to the old avatar. Side-by-side stills were compared by eye. **Not** automatically verified: the jump and slide
  poses in this game (the game has no debug hook); please jump and slide once on the preview.
- Real-device frame rate with this model in the original game: not measured.

# Frost — Phase 5.6: World 07, the Celestial Ice Palace finale

World 07 is the last world and uses everything the earlier ones introduced. It adds no new mechanic; it is pure data in
`src/worlds/runnerThemes.js`:

- **Hazards on**: wolf, shard, hole, gust and mist (`hazards: { wolf, shard, hole, gust, mist }`).
- **Each rarer than at home**: wolf/shard/hole pattern weights 0.7 / 0.5 / 0.4 (single / with a wall / pair) against 1.6-2 in
  their own worlds; gusts every ~260 m (World 06: 200 m); two short mist banks of 110 m at 900-1010 and 1600-1710 m
  (World 05: 130 m, five banks). The last 290 m before the 2000 m finish are clear of mist, and the last gust is well before it.
- **Fairness** is unchanged: every hazard goes through the same generator rules (reaction time, shift time, gust windows).
- Worlds 01-06 are untouched; their hazard flags are pinned by a test.

## Tests (run here)
- `npm test`: 183/183 (new `tests/palace.test.js`; the "only in its world" tests of Worlds 02-06 now also allow 07).
  The bot finishes World 07 on seeds 81-84, meeting walls, wolves, shards, holes, at least 4 gusts and thick mist each run.
- `ONLY=palace node scripts/runner-e2e.mjs <url>`: 3/3 (Auto play 60 s through World 07, all four obstacle kinds seen, no
  page errors). Software-rendered headless Chrome.
- `ONLY=worlds` 9/9, `ONLY=select` 28/28, `ONLY=level` 26/26. Three old e2e checks were stale and are fixed here (not game bugs):
  the `worlds` and two `level` start-screen checks were measuring World 01 because they lacked `unlock=all`, and the
  "Next world" check expected a link although it is an in-page button since 5.2.
- `node scripts/runner-perf.mjs <url> --budget --world=07`: every hazard type in view (wolves, shards, holes, gust line) is
  within budget: at most 27 draw calls / 249k triangles on desktop, 27 / 206k on phone portrait. Each hazard is measured
  on its own, not all together in one frame, and real-device frame rates are not measured.
- Not tested here: how hard the finale feels to a human. The bot finishes it, but its difficulty needs a real play-through.

# Frost — Phase 5.5: World 06's aurora gusts

World 06 "Sky of Aurora" gets its signature hazard: **wind gusts**. Unlike the wolf, shard and hole, a gust never kills.
It shoves Aisha one lane sideways as she crosses a gust line, so it is a displacement/difficulty effect: it can push her
toward an obstacle she had lined up to avoid. (If a harsher version is wanted, that is a one-constant change in the config.)

- **Data**: `gust: { startAt: 150, period: 200, jitter: 40 }` in `src/worlds/runnerThemes.js` (World 06 only; every other
  world has `gust: null`). `GUST = { pre: 3, post: 16, warn: 80, glide: 1 }` in `src/runner/config.js`.
- **Sim** (`src/runner/sim/gust.js`): gust `k` sits at `startAt + k*period + hash(k)*jitter` and blows left or right from a
  hash of `k`, so a seed-free, deterministic but irregular sequence. When the runner crosses the line the lane changes by
  one (nothing happens at an edge lane) with the normal smooth lane glide, and a `gust` event is emitted.
- **Fairness**: the generator keeps every obstacle row out of the window from 3 m before to 16 m after a gust line
  (`avoidGust`), so after being shoved there is always at least the 0.93 s needed to react (16 m is about 1.28 s at top speed).
- **Telegraph** (`scene/Gusts.jsx`): a chevron decal on the ground shows the direction from 80 m away, and instanced wind
  streaks build up before the line and fade after. One instanced mesh each, so the draw-call cost is small.
- **Auto play** reads the lane after the shove like any other state and finishes the whole level on four seeds.

## Tests (run here)
- `npm test`: 179/179 (new `tests/gust.test.js`, 9 tests: determinism, irregular spacing, last gust before the finish,
  recovery window, lane shove incl. edge lanes, generator keeps rows out of windows on 6 seeds, gusts only in World 06,
  bot finishes World 06 on seeds 71-74).
- `ONLY=gust node scripts/runner-e2e.mjs <url>`: 9/9 (no push before the line, one-lane shove after it, run keeps going,
  Auto play 40 s through World 06, World 01 has no gusts). Software-rendered headless Chrome.
- `node scripts/runner-perf.mjs <url> --budget --world=06`: gust line in view 23 draw calls / 231k triangles on desktop,
  22 / 187k on phone portrait; within the budget. These are renderer counts, not real-device frame rates (not measured).
- The chevron decal is faint in headless stills; the wind streaks are clearly visible. Worth a look on a real phone.

# Frost — Phase 5.4: World 05's dream mist

**Frosted Dream Desert** gets banks of dream mist. The signature hazard here is *visibility*, not another obstacle (a slow snow drift was
considered and dropped: slowing you down has no fail state). While a bank passes, the fog closes in from 70-520 m to **10-50 m** and
takes a lilac tint, the painted backdrop fades out, and obstacles show late: at full mist something 12 m away is still 96% visible and
you can see about 40 m ahead.

- **Pure and predictable** (`sim/mist.js`): the mist is a function of the distance run (`mistAt`), so it is the same on every attempt and fully
  testable. Data in `runnerThemes.js`: `mist: { startAt: 160, period: 340, length: 130, ramp: 30, near: 10, far: 50 }`: banks at 160-290,
  500-630, 840-970, 1180-1310, 1520-1650 m; each thickens and clears smoothly over 30 m; the opening stretch and the last 150 m before the
  finish are always clear (unit-tested for every world with mist).
- **Fairness is measured**: at the distance needed to dodge at top speed (`(REACTION + 2 x SHIFT_TIME) x 12.5` = 11.6 m) an obstacle is at
  least 95% visible; vision in full mist (40 m) is 3.4 times that. **The Auto play bot only reacts to what the fog lets it see**
  (`sim.vision`), and it finishes World 05 on 4 seeds, and on 2 more even when its vision is cut to 16 m (1.4 times the dodge distance).
- **Rendering** (`MistFog` in `RunnerGame.jsx`, `Backdrop.jsx`): the scene's fog range, fog colour and background follow `sim.mist` every
  frame; the backdrop painting's opacity falls with it. No new asset or draw call.
- Only World 05 has mist; Worlds 01 to 04 are unchanged (tested in the browser too).

Not done: no wind sound, no drifting mist particles, and the sky shader itself does not thicken (only the ground, trees and painting do).

---

# Frost — Phase 5.3: World 04's cracking ice

**Frozen Ocean** gets holes in the ice, the first hazard you can also *jump*: a lane shows cracks and a faint cyan column of light from
far away, breaks open into dark water with an icy rim between 24 and 20 m ahead of Aisha (`holeOpen`, `HOLE` in `config.js`: 1.6 s of
reaction at top speed), and is then a hole she must dodge **or jump**. Running into one ends the run: "You fell through the ice".

- **Collider** (`OBSTACLES.hole`): one lane wide (1.8 m), 1.6 m long, and it only hits a runner whose feet are below 0.25 m, so any jump
  clears it. Static: it never moves; it is already open when she gets there. The unit tests measure the timing: a jump 0.25 s before it
  clears it at 7.5, 10 and 12.5 m/s, the window of working jump moments is at least 0.12 s wide at every speed, too early lands in the
  water and too late runs into it.
- **Reward**: the generator puts an arc of three orbs at 2.35 m over every hole (all three lanes of a pair), so a jump collects them.
- **Generator**: holes count as lane blockers for every fairness rule (dodging is always enough, jumping is the extra option); opt-in
  patterns `hole`, `holeWall`, `holePair`; only World 04 turns them on (`hazards: { hole: true }`). Worlds 01 to 03 are unchanged.
- **Auto play** always dodges. Fix found on the way: a hole's danger zone reaches 1.08 m behind its centre (a wall's only 0.73 m), and the
  bot's orb steering considered it passed at 0.9 m, steering back into it. It now keeps every obstacle in view until 1.3 m behind it.
- **Rendering** (`scene/Obstacles.jsx`): decals on the trail: a crack texture (drawn bigger than the hole) with a light column, then the
  water patch growing from 55% to 100% while it breaks open. No new asset (all procedural textures); three instanced meshes.

Not done: no ice-crack sound or splash, no ripple animation in the water, Aisha does not visibly fall in (the usual knock-back plays).

---

# Frost — Phase 5.2: World 03's crystal shards

**Crystal Mountains** gets falling crystal spires. A pulsing ring and a tall beam of light mark a lane from far away; the spire falls
while it is 34 to 16 m ahead of Aisha (`shardFall`, `SHARD` in `config.js`) and has landed 16 m before her, which is 1.28 s at top speed:
more than the generator's worst case for two lane changes (0.93 s, unit-tested). It then blocks that lane (collider 1.5 m wide,
**2 m high, above a jump's 1.7 m apex: it can only be dodged**); it is drawn taller (3 m) than the collider, which only ever favours the player.

- **The collider is static**: the fall happens while the shard is 16+ m away, so only the visuals animate (`scene/Obstacles.jsx`:
  fall, tilt and spin, the footprint appears on landing, the warning ring and beam disappear on landing).
- **Generator**: shards count as lane blockers for every fairness rule; patterns `shard`, `shardWall`, `shardPair` are opt-in
  (a world's weight is a number, missing = never). Only World 03 turns them on (`hazards: { shard: true }` in `runnerThemes.js`),
  so Worlds 01 and 02 are unchanged (their row pins and wolf tests still pass).
- **Auto play** treats a shard like a wall; the bot finishes World 03 on 4 seeds and meets 10+ shards per level (`tests/shard.test.js`).
- Game-over text: "Crushed by a crystal". No new draw calls beyond three instanced meshes (spire, ring, beam).

Not done: no impact sound or screen shake on landing, no glass-break particles; shards do not yet fall *near* Aisha (they are
always telegraphed 16+ m ahead on purpose).

---

# Frost — Phase 5.1: World 02's wolf

Phase 5 gives each world a signature hazard, one PR per world. **Whispering Ice Forest** gets the wolf (`public/assets/expedition/wolf.glb`:
rigged, `run` 0.38 s and `walk` 0.67 s clips, ~10k triangles, faces +z, 1.62 m tall at scale 1; drawn at 0.8 = 1.3 m).

- **Behaviour**: it waits just outside the trail (x = 5.6 m, from the nearer edge), starts to run when it is 26 m ahead of Aisha, and is
  in its lane at 14 m ahead, then holds there facing her. It blocks that lane like a wall, but it is only 1.0 m high (collider), so a
  jump at the usual moment clears it too. `WOLF` and `OBSTACLES.wolf` in `config.js`.
- **The collider follows the visible wolf** (sim obstacle kind `wolf`: its `x` is recomputed every step from `wolfX`, so what you see
  is what can hurt you; no collision is possible before it settles because it is 14+ m away while it moves). At top speed, the 14 m
  left after the lunge is 1.12 s: more than the generator's worst case for two lane changes (`REACTION + 2 x SHIFT_TIME` = 0.93 s;
  unit-tested).
- **Generator** (`sim/patterns.js`): wolves count as lane blockers for every fairness rule (`openLanes`, `minGap`, no row blocks all
  three lanes). New patterns `wolf`, `wolfWall`, `wolfPair` are *opt-in*: a world's weight for them is a number, not a multiplier, and
  missing means never. Only World 02 turns them on (`hazards: { wolf: true }` and weights in `runnerThemes.js`), so **World 01's
  generated rows are unchanged** (the 4.2 pin still passes) and no other world sees a wolf.
- **Rendering** (`scene/Wolves.jsx`): skinned meshes cannot be instanced, so 3 clones are pooled; they pace at the edge, run during the
  lunge, and hold a slowed `walk` stance once in the lane. The model is only downloaded in worlds with the hazard (World 01 never
  requests it; tested). Game-over text: "The wolf got you".
- **Auto play** treats a wolf like a wall (it uses the wolf's stored lane, not its moving x); the bot finishes World 02 on 4 seeds and
  meets 10+ wolves per level (`tests/wolf.test.js`).

Not done: the wolf has no sound or howl yet, no ground telegraph beyond its own run-in, and it is not drawn with eyes or breath effects.

---

# Frost — data-driven worlds (PR 4.2)

`?game=frost&world=01..07` picks the world the runner renders (default `01`; unknown ids fall back to `01`). The world-select
screen that sets this arrives in 4.4, levels/finish in 4.3. All per-world data lives in **`src/worlds/runnerThemes.js`**
(pure data, readable from the simulation and from Node tests) and is attached to each world in `src/worlds/config.js` as
`world.runner`; World 01's existing fields (the original game's) are untouched.

| Field | What it drives |
| --- | --- |
| `sky`, `fog`, `light` | the sky shader colours, scene fog and background, hemisphere / ambient / sun lights |
| `snow` | flake colour and counts (desktop / phone) |
| `ground`, `trail` | the powder beside the trail and the packed trail with its lane dividers and rails (canvas textures) |
| `backdrop` | `null` = the 3D mountain massif (World 01); `{crop}` = the world's painting from `public/assets/backgrounds/worlds/` as the horizon |
| `patternWeights` | multipliers (default 1; 0 removes a pattern) for `wall1 wall2 ridge arch slalom wallRidge archWall zigzag` in `sim/patterns.js` |
| `finishDistance`, `difficultySeconds` | metres to finish (used by 4.3) and the run time until the generator is at full difficulty |

The paintings are portrait scenes with a road down the middle, so `scene/Backdrop.jsx` uses only the top 42% (sky, aurora,
castles, trees), mirrored across the width, faded into the sky above and the fog below. Worlds 02-07 so far differ by palette,
backdrop, pattern weights and finish distance (1500, 1600 ... 2000 m); their signature hazards come in Phase 5.

**World 01 is unchanged**, and this is checked three ways: (1) `tests/worlds.test.js` pins every theme constant to the runner's
original hard-coded value; (2) the first 14 obstacle rows of three seeds are pinned to what the generator produced before
worlds existed; (3) a screenshot of the ready scene (snowfall and UI hidden) before vs after differs only on Aisha, whose idle
animation is time-based (0.46% of pixels on desktop, all on her except 3).

Tests: `tests/worlds.test.js` (theme pins, registry, validity of all seven themes, pattern weights, per-world difficulty ramp,
**the Auto play bot survives every world**, 2 seeds x 150 s each) and `ONLY=worlds npm run test:e2e` (each world loads, runs under
Auto play, has its own fog colour; unknown id falls back).

---

# Frost — mobile budget (PR 4.1)

Budget for the runner, per frame, on the phone profile and desktop: **<= 350k triangles and <= 30 draw calls**, aiming for
60 fps with a 30 fps floor on phones. Check it with `npm run build && npx vite preview --port 4173` then `npm run test:budget`
(`scripts/runner-perf.mjs --budget`; exits 1 when over budget). Counts are renderer facts; headless software GL gives no usable
frame times, so real-device frame rates still need a phone.

| | before (Phase 3) | now |
| --- | --- | --- |
| Desktop 1534x630 | 28 calls, 408k triangles | 27 calls, 318k |
| Phone portrait 390x844 | 27 calls, 329k | 27 calls, 269k |

What changed: the orb's three 760-triangle spheres became a low-poly shell and core (the middle shell was hidden inside the
outer one and is skipped; crystals unchanged; 2,440 -> ~560 triangles), orbs are only drawn within 55 m, and desktop pine
LODs switch earlier (24 m / 80 m). Fixed cost: mountain massif ~83k, Aisha ~48k. Everything a new world adds must fit the same budget.

---

# Frost — Phase 3: Orbs of Chi and Auto play (runner)

**Orbs of Chi.** Collectibles built from the repo's `public/assets/collectibles/orb_of_chi.glb` (2,440 triangles, three
translucent shells, a core and crystals, no textures). The GLB's materials are only 11-29% opaque (made for a dark
background) and vanished against snow, so `scene/Orbs.jsx` merges the meshes per material and restyles them (saturated
shell, bright core, opaque ice-white crystals); they are instanced, one draw call per material. Collection is decided by the
sim only (`collectOrbs` in `sim/sim.js`): the body box (standing, ducked or airborne) is swept against the orb in z like
obstacles are, so a long frame cannot skip one.

- Ground lines (3-5 orbs, 2.2 m apart, chest height) are placed in the gap between two obstacle rows, in a lane that is open in
  both rows, so collecting never asks for more than the rows already ask. Orbs stay 3.2 m away from every row.
- Every fallen pine gets a 3-orb arc at 2.35 m: a standing Aisha (1.7 m) cannot touch it, a jump at the usual moment does.
- HUD counter, orb count on the game-over panel, best orbs saved locally (`frost-runner-best-orbs`).

**Auto play** (start-screen button). A watch-only mode: `sim/bot.js` drives the real game through `command(sim, cmd, true)`,
exactly the path the keyboard uses, so it exercises the real generator, collisions and orbs. It dodges walls (nearest open
lane), jumps ridges, ducks arches, and steers one lane at a time toward the nearest orb line only when every wall row ahead
keeps that lane open. Player input is ignored while it runs (`command()` rejects non-bot commands when `sim.auto`); **Stop**
or **Esc** returns to the start screen; Auto play runs do not touch best scores. If the bot ever died it would start a new
demonstration run. **Auto play is meant to stay in the game** and doubles as a test harness (a bot-survival unit test over
12 seeds for 180 s, and a browser test).

**Tests.** `npm test` (116 tests; new: orb sweep/collection/jump arcs/spawn clearance/determinism/reset, Auto play is
watch-only and survives and collects at least 40% of orbs). Browser (`npm run test:e2e`, `ONLY=orbs,auto,desktop,phone` reruns
a subset): orb collection and HUD, jump arcs, orb count on game over, Auto play start/watch-only/25 s survival with orbs/Stop/Esc,
and tapping Auto play on phones.

**Known issues.** Orb count on the first line of a run depends on the seed; orbs are not magnetised; the Auto play bot is a
perfect player (it never misses a jump) and does not yet showcase near-misses; no sound on pickup yet.

---

# Frost — Phase 2: gameplay feel (runner)

Targeted refinements of the Phase 1 runner; same architecture, assets and controls.

**Animation (measured, not guessed).** The rig was sampled in a browser: the `run` clip's stance foot moves at about
4.0 m/s at 1x (0.63 s cycle, ~2.5 m per cycle); `sprint` is ~2 m/s and unusable; `slide` drifts 1.3 m forward and 0.24 m
sideways. Run speed is now 7.5 -> 12.5 m/s (was 11 -> 22) and the run clip plays at `speed / 4.0` (1.88x at the start, capped
at 2.5x, `runRate` in `sim.js`), so the feet keep pace with the ground up to 10 m/s; at 12.5 m/s about 20% slip remains
(`footSlip`). The jump pose is scrubbed by the physics (`sim.airP`, 0..1), so it always matches the arc; landing plays the
recovery of the same export. Duck holds the crouch pose (clip `land` 0.26-0.34 s, head top measured 1.18 m); the collider is
1.2 m and the arch bottom is 1.4 m, so the visual and the collision agree.

**Feel.** Lane glide is ease-out (0.14 s, no overshoot) with one buffered change that expires after 0.2 s; Aisha leans and
turns slightly into lane changes. Jumps are buffered (a press up to 0.12 s before touch-down fires on landing), gravity is
heavier on the way down (38 up / 46 down), there is never a double jump. A duck cannot end while an arch is overhead.

**Obstacle generator** (`sim/patterns.js`). Weighted patterns (single wall, double wall, slalom pair, wall+ridge, arch+wall,
double-wall zigzag) unlocked by difficulty over 150 s; gaps tighten from 2.0 s to 1.25 s. Every row is checked against the
previous one: worst-case lane shifts from any lane the player can be in must fit in `0.45 s + 0.24 s per lane`, jump/duck
rows get 1.1-1.15 s of recovery, no row walls all three lanes, no row signature repeats three times, no action kind three
times. Ground chevrons (amber up = jump, blue down = duck) mark ridge and arch 8 m before them; every obstacle has a soft
footprint shadow. A bot that plays only through `command()` survives 150 s + 30 s on 12 seeds (`tests/runner.test.js`).

**Camera.** Closer than Phase 1 on every screen (5.6 m back on desktop/landscape, up to 8.6 m on tall portrait) with the
vertical follow damped to 30% of the jump height. `cameraFor` guarantees Aisha is on screen in every lane and the outer lane
edges are visible 14 m ahead at any aspect ratio (unit-tested for 7 aspect ratios).

**Game over.** Aisha is knocked back and crouches (no slide clip), a 40-point ice burst and a 0.2 s camera shake play, the
world stays where the impact happened, and after 0.6 s a panel shows the final distance at the top of the screen (left
column in short landscape) so Aisha and the obstacle stay visible. Restart is locked for those 0.6 s.

**Measurements** (`npm run build`, `scripts/runner-perf.mjs`, headless Chromium with a *software* GL renderer: draw calls,
triangles and JS cost are real; frame times are not representative and were not used):

| | draw calls | triangles / frame |
| --- | --- | --- |
| Desktop 1534x630 | 23 | 337k (pines ~205k, Aisha 48k, mountain 83k) |
| Phone portrait 390x844 (tighter LODs) | 22 | 270k (pines ~138k) |
| Phase 1 build, before culling trees behind the camera | 23 | 435k |

JS cost of the sim + camera step: 0.015-0.04 ms per frame; JS heap flat (36 MB over 8 s). No shadow maps are used.
Not measured: real GPU/phone frame rates.

**Tests.** `npm test` (all suites) and `npm run test:e2e` against `vite preview` (56 browser checks: keyboard, swipes, lanes,
jump/landing, duck, each obstacle, game over, restart, desktop 1534x630, phone portrait and landscape).

**Known issues.** The run clip still slips ~20% above 10 m/s; the duck is a held pose rather than an animation; the
game-over reaction is a held crouch plus lean (no stumble clip); real-device performance is untested; some pine crowns
show scan artefacts up close (as in the expedition).

---

# Frost — Phase 1: the three-lane runner (`?game=frost`)

`/?game=frost` now opens the **runner**: Aisha runs a snowy mountain trail on three lanes. The earlier third-person
expedition is untouched and still available at `/?game=frost&mode=expedition` (the rest of this file describes it).

| Action | Desktop | Touch |
| --- | --- | --- |
| Start / restart | Enter, Space or R on a menu screen, or the button | Tap the button |
| Move lane | ← → / A D | Swipe left / right |
| Jump | ↑ / W / Space | Swipe up |
| Duck | ↓ / S | Swipe down (Down in the air = fast fall) |
| Pause | Esc / P (also pauses when the tab is hidden) | Pause button |

Obstacles (each has its own collision box in `src/runner/config.js`, independent of its mesh):
ice wall (one lane, full height: change lanes), fallen pine (all lanes, 0.8 m: jump), ice arch with icicles
(all lanes, bottom at 1.05 m: duck). Hit one and the run ends; Restart starts a fresh run.

| Area | Files |
| --- | --- |
| Tuning | `src/runner/config.js` |
| Pure simulation (state machine, physics, spawner, collision) | `src/runner/sim/sim.js` |
| Input (keys, swipes) and camera maths | `src/runner/sim/input.js`, `src/runner/sim/camera.js` |
| Scene | `src/runner/scene/` (`Ground`, `RunnerForest`, `Obstacles`, `RunnerAisha`, `scenery.js`) |
| Screens / wiring | `src/runner/RunnerGame.jsx`, `runner.css` |

Reused from the expedition: `aisha.glb` (run, jump/land export, crouch pose), `alpine-spruces.glb` (decorative pines,
placed only beyond `TREE_MIN_X`, never on or over the lanes), `mountain-massif.glb`, the sky and the snowfall.

Tests: `npm test` (`tests/runner.test.js`: lanes, jump, duck, every collision, restart, spawner fairness, swipes, camera
fit, tree placement) and `npm run build && npx vite preview --port 4173` then `npm run test:e2e` (real browser, keyboard and
touch, desktop 1534x630, phone portrait and landscape; needs Playwright and a browser). `?debug` exposes `window.__frostRunner`.

Known limitations (Phase 1): no dedicated duck/slide animation (the crouch pose of the jump export is held, with a lean);
the run clip's foot speed is not matched to the ground speed; there are no sounds, orbs or rewards; only one world; pines
are never used as hazards (the fallen pine is a procedural log); the snowy ground is flat with a banked shoulder.

---

# Frost — The Frozen Trail (first playable)

Frost is a second, independent game in this project: a third-person 3D
mountain expedition with Aisha. The original **Frost Girl** endless runner is
unchanged and still launches on its own.

| URL | What loads |
| --- | --- |
| `/` | Game selection screen |
| `/?game=original` | Original Frost Girl runner (`src/App.jsx`, unchanged) |
| `/?game=frost` | Frost expedition (`src/expedition/`) |
| `/?game=frost&viewer=aisha&clip=walk&t=0.4` | Dev-only asset/clip viewer (`aisha`, `wolf`, `massif`, `spruces`; `&lod=0..3` for spruces) |

Each game is lazy-loaded and switching goes through a full page navigation, so
the two never share runtime state, CSS or input listeners. Frost CSS is scoped
under `.frost-root`.

## Run it

```sh
npm install
npm run dev          # open http://localhost:5173/?game=frost
npm test             # includes tests/expedition.test.js
npm run build && npm run preview
```

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move | W A S D / arrow keys | Floating joystick (left half of screen) |
| Look | Mouse (click to lock pointer; drag also works) | Drag on the right half |
| Sprint | Shift (uses stamina) | Sprint toggle button |
| Jump | Space | Jump button |
| Pause / resume | Esc or P | Pause button (top right) |
| Start / restart | Enter or Space on a menu screen | Buttons |

## The level

Trailhead (forest) → frozen stream crossing (ice) → wolf territory off the
trail → rockfall across the trail (jump the low boulder or go around) →
snowbanks narrowing the path → narrow ledge above a ravine, with an ice patch
that pushes toward the drop → the frost stone (supernatural cold, a pale figure
glimpsed once on the ridge) → Ridge Camp checkpoint.

Fail states: falling into the ravine, or health reaching 0 (wolf bites, hard
falls, lingering at the frost stone). The wolf always notices, then growls and
warns (on-screen warning, ~3 s of patience) before it charges; backing away
calms it.

## Code layout (`src/expedition/`)

| Area | Files |
| --- | --- |
| Entry / Canvas | `ExpeditionGame.jsx` |
| Game state + input | `core/store.js`, `core/input.js`, `core/noise.js` |
| World model (pure, shared by physics and rendering) | `world/trail.js`, `world/level.js`, `world/terrain.js`, `world/world.js` |
| Gameplay logic (pure) | `gameplay/player.js`, `gameplay/wolf.js`, `gameplay/camera.js` |
| Per-frame orchestration | `gameplay/GameLoop.jsx` |
| Rendering | `scene/Terrain.jsx`, `Forest.jsx`, `Rocks.jsx`, `Distant.jsx`, `Landmarks.jsx`, `Atmosphere.jsx`, `Sky.jsx`, `textures.js` |
| Characters | `actors/Aisha.jsx`, `actors/Wolf.jsx` |
| UI | `ui/Hud.jsx`, `ui/Screens.jsx`, `ui/TouchControls.jsx`, `expedition.css` |
| Dev tool | `dev/ClipViewer.jsx` |

The terrain mesh and the physics sample the same height grid with the same
triangulation, so Aisha's feet stay exactly on the visible surface.

## Asset pipeline

Source GLBs live in `assets-source/` (git-ignored, ~1.9 GB). Runtime GLBs are
generated into `public/assets/expedition/` (~8 MB total):

```sh
node --max-old-space-size=14000 scripts/build-expedition-assets.mjs path/to/assets-source [aisha|wolf|massif|spruces]
```

The script (gltf-transform + meshoptimizer + sharp, dev dependencies only)
merges Aisha's seven animation exports into one rigged GLB, remaps the Mixamo
bone names onto the Meshy skeleton (by hierarchy: Meshy's spine is
`Hips > Spine02 > Spine01 > Spine`), removes baked root motion from the sprint
and slide clips, decimates meshes and converts textures to WebP. It also cuts
the Meshy forest scan into eight individual spruces (crown detection, mound
removal, per-tree trunk base) and builds four LODs per spruce.

## Asset inventory

Sizes are the source files in `assets-source/`. Every file was inspected
(glTF JSON parsed, clips listed, textures measured); runtime outputs were
loaded and checked in the game and in the clip viewer.

| Source file | Size | Contents (inspected) | Use | Verified |
| --- | --- | --- | --- | --- |
| `aisha/animations/Aisha_Idle.glb` | 56.2 MB | Skinned (24 joints), 170k tris, 3× 4K PNG; clip `Armature\|Idle_9\|baselayer` 2.03 s | Base mesh + `idle` | ✅ in game |
| `aisha/Meshy_AI_Aisha_Rigged_…_All_animation.glb` | 56.4 MB | Same mesh, Mixamo bone names; clips `Walking` 1.03 s, `Running` 0.63 s | `walk`, `run` (used for sprinting) | ✅ after bone remap |
| `aisha/animations/Aisha_Sprint.glb` | 56.3 MB | clip `run_fast_5` 1.83 s, 4.25 m forward root motion | `sprint` (root motion removed; bundled, not used in play) | ✅ viewer |
| `aisha/animations/Aisha_Jump.glb` | 56.2 MB | clip `Armature\|Jump_Over_Obstacle_inplace\|baselayer` 2.03 s (diving vault) | `jump` (bundled, not used — too acrobatic) | ✅ viewer |
| `aisha/animations/Aisha_Landing_REPAIRED.glb` | 56.2 MB | clip `Armature\|Regular_Jump\|baselayer` 1.90 s — a full jump, not only a landing | Jump take-off, fall and landing (sub-ranges, baked hip lift clamped) | ✅ in game |
| `aisha/animations/Aisha_Slide.glb` | 56.2 MB | clip `Armature\|slide_right\|baselayer` 1.77 s, 4.1 m root motion | Stumble when hit by the wolf (first 0.5 s) | ✅ viewer |
| `aisha/animations/Aisha_Celebration.glb` | 56.4 MB | clip `Armature\|Victory_Cheer\|baselayer` 9.37 s | Checkpoint celebration | ✅ in game |
| `aisha/Aisha_RigSource.glb` | 51.3 MB | Unrigged mesh, 170k tris | Not used (rig source) | ✅ inspected |
| `aisha/aisha_master_beauty_h.glb` | 69.8 MB | Unrigged 1.45M-tri sculpt; byte-identical to `Meshy_AI_aisha_master_beauty_h_…glb` | Not used | ✅ duplicate (md5) |
| `natures/animated/Meshy_AI_frost_wolf_rigged_…_All_animation.glb` | 62.4 MB | Skinned (41 joints), 10k tris, 3× 4K PNG; clips `Walking` 0.67 s, `Running` 0.38 s, in place | The wolf (`walk`, `run`) | ✅ in game, both clips animate |
| `natures/frost_wolf_optimized.glb` | 61.7 MB | Same wolf, unrigged; identical to `Meshy_AI_frost_wolf_optimized_…glb` | Static fallback candidate | ✅ duplicate (md5) |
| `natures/frost_alpine_mountain.glb` | 245.3 MB | **Not a mountain**: byte-identical to `Meshy_AI_frost_alpine_mountain_wolf_…glb`, a 7M-tri wolf sculpt | Not used | ⚠️ misnamed |
| `natures/frost_mountain_massif.glb` | 75.7 MB | 1.38M tris, 2×4K + 2K JPEG | Distant summit landmark | ✅ in game |
| `natures/alpine_winter_forest_.glb` | 351.7 MB | 7.66M tris — one fused mesh: a snow mound with ~10 spruces | Source of all forest trees (8 spruces extracted) | ✅ in game |

Runtime outputs (`public/assets/expedition/`):

| File | Size | Triangles | Textures | Clips |
| --- | --- | --- | --- | --- |
| `aisha.glb` | 3.1 MB | 47.7k | 1K WebP ×3 | idle, walk, run, sprint, jump, land, slide, celebrate |
| `wolf.glb` | 1.5 MB | 10.2k | 1K WebP ×3 | walk, run |
| `mountain-massif.glb` | 3.9 MB | 83k | 2K WebP | — |
| `alpine-spruces.glb` | 4.6 MB | 8 spruces × 4 LODs (~8k / 1.8k / 300 / 85 tris) | 2K WebP (shared) | — |

## Known limitations

- Forest: every tree is one of 8 spruces cut from the Meshy scan. Very close
  up (< ~5 m) the decimated scan shows some stretched needle texture; the
  close LOD is limited to 8k triangles for performance. Trees keep trunk
  colliders; crowns are kept clear of the trail corridor.
- No audio yet.
- Wolf has only walk/run clips: when it stops (alert/warn) it holds a walk
  frame with a lowered, growling crouch rather than a dedicated idle/growl clip.
- No dedicated fall clip: the airborne part of `Regular_Jump` is held.
- Performance measured on an integrated AMD Radeon GPU (headless Chrome,
  1280×720): ~17–18 ms median frame time (same as the earlier procedural
  forest within noise), ~90 draw calls, ~1.2M triangles.
  Mobile hardware has not been tested on a real device (touch controls were
  tested with device emulation).
