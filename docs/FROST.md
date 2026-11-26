# Frost — Phase 7.1: retiring "Frost Girl"

On request, the standalone **Frost Girl** prototype (`?game=original`: the spiral-track runner with its own app, HUD and tests) is gone and **Frost**
is the one game. This overrides the earlier standing rule to keep the original prototype intact. Its spiral mountain trail is brought into Frost in the next
change (Phase 7.2); the path was recorded from `src/game/systems/spiralTrack.js` before deletion and is in git history.

- **Entry:** the site root opens Frost's own menu (Start run, Auto play, Worlds, Settings) directly: there is no game-selection screen. Old
  `?game=original` bookmarks, `?game=frost` and any unknown `?game` value all open Frost. The only other address left is the earlier
  third-person expedition prototype at `?game=frost&mode=expedition` (it is not "Frost Girl"; say if it should go too).
- **Removed:** `src/game/` (the original scene, systems, player, environment), `src/ui/`, `src/state/`, the original app and its styles, the selection
  screen and its styles, the unused template images, `src/worlds/frozenKingdomPerspective.js`, the 5 MB Sketchfab Aisha model
  (`public/assets/characters/`), and the original game's 11 test files (movement, run simulation, spiral track, camera, forest, crystal mountain,
  track motion, artwork perspective, orb geometry, character preview and avatar tests). The world registry keeps only what Frost uses
  (id, name, painting, runner theme).
- **Renamed:** the page title is "Frost — Run" (it was "Frost Girl — Frozen Kingdom"), the meta description and the icon (`public/frost.svg`).
- **Kept on purpose:** the orb model credit in the README (CC BY 4.0 requires it, and the runner still uses that model), Auto play, all
  saved data (the keys were already `frost-runner-*`; nothing used a "Frost Girl" key), and the expedition prototype.
- Older sections of this document describe the original game as it was at the time; they are history.

## Tests (run here)
- `npm test`: 222/222 (11 original-game test files removed; `tests/worlds.test.js`, `tests/readme.test.js` and `tests/sw.test.js` updated: the registry must hold only
  what Frost uses, the README must not describe or link the retired game, and the orb credit must stay).
- `ONLY=entry` 14/14 in headless Chrome: the site root, `?game=frost`, an old `?game=original` bookmark and an unknown `?game` each open Frost's menu with no
  selection screen, no "Frost Girl" or "Enchanted Journey" text and no page errors; the expedition is still reachable; the title, description and icon say Frost.
- Regression slice `ONLY=entry,desktop,phone,worlds,select,settings,offline,quality`: 152/152 checks passed (entry, desktop, phone, worlds, select, settings, offline, quality). The runner's own code is untouched by this change, so the
  long whole-level, sound, music, challenge and outfit sections were not re-run for it (they run in the next change).
- Build: the original app's chunk (79 kB) and stylesheet are gone from the production build; `public/assets` is 12 MB instead of 17 MB.

# Frost — Phase 7.0: music

A calm, generative music loop, synthesized with Web Audio like the effects (nothing to download, works offline). **I cannot hear it**: I wrote the
rules so it cannot sound harsh (see below) and measured it, but whether it is *pleasant* is for you to judge; the numbers are plain constants.

- **What it is** (`audio/music.js`, pure rules): only notes from a pentatonic scale, so any mix is consonant. A slow pad (a triangle and a slightly
  detuned sine per note) changes chord every two bars through a gentle loop that always comes home, a soft bass root, and sparse bell notes (about
  330-1400 Hz) that are mostly chord tones. Each bar is generated from a seeded random source: it never repeats exactly but is reproducible in tests.
- **Each world has its own key, scale and tempo:** 01 A major 68 bpm, 02 G minor 64, 03 D major 72 (the most bells: bright crystals), 04 E minor 60,
  05 F major 56 (the slowest, sparsest: dreamy mist), 06 B major 76, 07 C major 80 with an extra upper pad voice (the finale is fuller). The music retunes at the next bar when the world changes.
- **Behaviour:** it starts on the first tap or key press, plays softly on the start screen, at full level while running, is silent when paused (nothing is
  even scheduled), softer after a crash, and is muffled in thick mist like the wind. A crash or a level chime ducks it for a moment so the effect is heard.
  **Off for Auto play.** Settings > Music switches the music off on its own; Settings > Sound and the `M` key silence everything. Music has its own
  voice limit (16 notes), so it never uses up the effects' limit.
- **Measured** (`node scripts/audio-report.mjs` now includes it; the noise is seeded so the numbers are reproducible): in every world the music peaks
  at 0.11-0.13 and its loudness (RMS) is about 0.02, which is quiet and well under the effects (the crash peaks at 0.58); it is never silent after its
  first bars; with a crash and three chimes on top the mix peaks at 0.79. It is deliberately on the quiet side because I cannot judge taste: raise
  `MUSIC_GAIN` in `audio/engine.js` if you want more.
- **A bug the measurement found, and fixed for the effects too:** a crash landing together with orb chimes after a quiet moment peaked at **1.34**
  (over full scale, so it would distort) **even with the music off**. The browser's compressor is not a true limiter. The output now ends in a soft clipper:
  quiet and normal sounds pass at unity (within 1.5% up to 0.2), only big peaks are rounded (about -14% at 0.6), and the output can never exceed 0.83 of
  full scale, however loud the mix. I first tried a harder compressor setting instead and reverted it: it adds automatic makeup gain and made every
  effect about 80% louder, which would have changed the balance merged in 6.2.

## Tests (run here)
- `npm test`: 294/294 (new `tests/music.test.js`, 8 tests: world data, pitch maths, deterministic random source, every note of every bar in every world in
  the pentatonic scale, chord loop, sparse and soft with bounded pitches and gains, the extra voice in World 07, state volumes and the mist filter;
  and 6 new engine tests with the fake audio context: scheduling a bar ahead of the clock, silence for Auto play / Sound off / Music off / paused /
  hidden tab, retuning per world, no burst after a stall, separate voice limit, and the soft clipper's maths).
- `ONLY=music` 12/12 in headless Chrome with real Web Audio and the engine's counters: nothing before the first tap, Music switch on by default,
  music begins on the start screen and keeps going bar by bar while running, retunes for World 04, nothing scheduled while paused, the switch turns it
  off and is saved while effects still play, Auto play plays none, `M` stops it.
- Regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound,music,challenge,outfit` 248/248 (whole levels in the browser; the Retry/Restart button inside the viewport at 1534x630 and on phones; the Settings sheet with its new switch fits on phones in both orientations).
- **Not verified:** how it sounds (taste, repetition over a long session, whether it is too quiet or too loud on real phone speakers), and the CPU
  cost of a continuous pad on a low-end phone (about 8-20 oscillators at once; not measured).

# Frost — Phase 6.9: an accurate README

The README still described the early spiral prototype ("other playable worlds and audio are not implemented yet") and did not mention the runner
at all, and its closing section said `?game=frost` was the expedition. It now opens with what the three addresses are, then describes the runner:
the seven worlds and their hazards, controls, every URL flag (`world`, `unlock`, `debug`, `fps`, `tier`, `adapt`, `mode`), the saved-data keys, the
commands and browser scripts (and that Playwright is not a project dependency), the standing rules, where things are, and the open decisions and
known gaps. The original prototype's notes are kept intact under their own heading.

`tests/readme.test.js` (7 tests) keeps it true: the world table must match the world data, every documented flag must be read by the code, every npm
script, script file and e2e section it names must exist, the storage keys and controls must match the code, and the stale claims must stay gone.
I checked the test is not vacuous by breaking a distance and a flag name in the README: both were caught. No runtime code changed, so no browser
regression run was needed; `npm test` is 280/280 and lint is clean.

# Frost — Phase 6.8: smaller models (mesh compression)

The remaining big downloads were the four runtime models. Their textures were already WebP, but their **geometry and animation data was not
compressed at all** (spruces 2.0 MB of 4.5, Aisha 2.5 MB of 3.0, massif 1.6 MB of 3.8, wolf 0.7 MB of 1.5). This applies mesh compression
(`EXT_meshopt_compression`, decoded by the browser loader with no extra code) and **does not touch any texture**, so nothing about how a model
looks is re-encoded. That also keeps World 01's look (a standing rule) as it was.

| model | before | after |
| --- | --- | --- |
| aisha.glb | 3.03 MB | 1.50 MB (-51%) |
| alpine-spruces.glb | 4.54 MB | 3.51 MB (-23%) |
| mountain-massif.glb | 3.80 MB | 2.83 MB (-26%) |
| wolf.glb | 1.46 MB | 1.14 MB (-22%) |
| **total** | **12.83 MB** | **8.98 MB (-30%)** |

First visit over the wire, measured with `scripts/net-report.mjs` on a build of master and of this branch:

| page | before | after |
| --- | --- | --- |
| runner, World 01 | 12.71 MB | 9.17 MB (-28%) |
| runner, World 02 (and 03-07 alike) | 10.66 MB | 7.78 MB (-27%) |
| original game | 4.26 MB | 2.73 MB (-36%) |

(Together with 6.7, World 02 went from 14.44 MB to 7.78 MB.)

- **Is it lossless? Almost, and I measured the difference.** The geometry is already quantized and is compressed exactly. Animation rotations
  are stored with a 16-bit quaternion filter. Compared keyframe by keyframe over all 12,087 rotations in Aisha's eight clips: the largest change
  in the actual rotation is **0.83 degrees** at one keyframe (a rotation and its negative are the same rotation, and 1,735 are stored with the
  opposite sign), and translations differ by under 0.1% of the rig's size; the wolf's largest change is 0.0001. Structure is identical before and
  after: skin and joint counts (24 and 41), every clip and its duration, triangle counts, materials and textures.
- **Looks the same:** rendered World 01, World 02, the original game and the expedition on the old and new builds. World 01 differs by 0.59 of 255
  on average (the animated pose and falling snow); the original game 0.66. No page errors anywhere. (World 02 and the expedition differ more only
  because scenery scrolls and the camera moves between two runs started at slightly different moments; in the expedition the new build even shows
  the distant mountains that had not yet arrived in the old one at the same moment, because the file is smaller.)
- **Reproducible and guarded:** `npm run models:compress` (`scripts/compress-models.mjs`, idempotent) compresses every .glb in the folder. If the
  models are ever regenerated from sources with `scripts/build-expedition-assets.mjs`, run it afterwards. A test fails if a model is not
  compressed, if the models exceed 9.5 MB in total, or if Aisha's or the wolf's clips and joints go missing.
- **Cost not measured:** decoding is done in the browser by a small WebAssembly decoder and takes a moment per model on load; I have not measured
  it on a real phone (it should be small next to the download saved, but that is not a measurement).
- **Still not touched:** the textures (spruces 2.5 MB, massif 2.3 MB as 2048-pixel WebP). Lowering them would change how the forest and World 01's
  mountains look, which is a judgement for you.

## Tests (run here)
- `npm test`: 273/273 (new `tests/models.test.js`, 4 tests).
- Full regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound,challenge,outfit` on the compressed models: 235 of 236 passed. The one
  failure was my own too-tight pixel threshold in the outfit check (at most 8 blue pixels left on Ember; it got 11, against about 730-990 on Frost, because the
  animation lands on a very slightly different pose); I changed it to a relative bound (under 6% of Frost's) and re-ran the outfit section twice, 14/14 both times.
  Everything else passed, including whole levels in the browser, the sound checks, and the Retry/Restart button at 1534x630 and on phones.

# Frost — Phase 6.6 (part 3): Aisha's outfits

The last part of plan item 6.6. Cosmetic only, as the standing rule says: every outfit has the same body, collision box and physics;
there is no shop and nothing to buy. They are **colour variants** of one model, because there are no additional models or textures to
swap in: what changes is the colour of the blue parts of her texture (the sash, leggings and glints). Her white top, skin and hair keep
their colours. They apply in the runner (not in the original game, which does not read these settings).

| Outfit | Look | Unlocked by |
| --- | --- | --- |
| Frost | her original blue (always open) | nothing |
| Ember | red-orange | 6 stars (of 21) |
| Aurora | green | 12 stars |
| Twilight | violet | 1 challenge badge (of 7) |
| Gold | olive-gold | 4 challenge badges |

- **Choosing:** Settings > Outfit cycles through the open outfits and names the next locked one with what it needs
  ("Outfit: Frost · next: 6★"). Saved with the other settings. A saved outfit that is still locked (for example after a reset) is drawn as
  Frost. `?unlock=all` opens all five.
- **How:** `src/runner/outfits.js` (data and unlock rules) and `scene/outfitMaterial.js` (a small fragment-shader snippet that turns only
  blue hues). **The default outfit patches nothing**, so Frost renders exactly as before; the first non-default pick patches each material
  once and later changes only move a uniform. No new files to download.
- **Checked by pixel counts:** in headless Chromium, Frost shows 730 blue pixels on her and Ember 7 blue and 776 red-orange. I also looked at
  all five side by side; they read as clearly different outfits.
- Settings sheet: it now has nine buttons, so on short wide screens (phone landscape, small desktop windows) it lays out in three columns.

## Tests (run here)
- `npm test`: 269/269 (new `tests/outfits.test.js`, 7 tests: the list and its distinct colours, unlocking exactly at the requirement from stars
  and badges, `?unlock=all`, a locked choice falls back, cycling through open outfits only, the "next locked" text, saving and junk values).
- `ONLY=outfit` 14/14 in headless Chrome (a fresh save offers only Frost and patches no material; 6 stars open Ember; it is saved and drawn
  with its hue and the colours really move; a locked saved outfit is drawn as Frost; `?unlock=all` cycles all five).
- Regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound,challenge,outfit` 236/236 (whole levels in the browser; the Retry/Restart button inside the viewport at 1534x630 and on phones; the nine-button Settings sheet fits on phones in both orientations).
- **Not verified:** how the outfits look on a real screen and in motion (I looked at stills), and whether the star and badge requirements
  suit how fast people progress: the badge requirements depend on the challenge goals, which are themselves unvalidated.

# Frost — Phase 6.6 (part 2): world challenges

Part 2 of plan item 6.6 (part 1 was Endless mode). Cosmetic outfits (part 3) are not started. I read "per-world star goals" as **one
optional challenge per world**, tied to the world's signature hazard and asking for skill, not just for finishing. If you meant
something else by star goals, say so: this is a reading, not something you specified.

| World | Challenge | Goal |
| --- | --- | --- |
| 01 Frozen Kingdom | Collect 90% of the orbs | 90% |
| 02 Whispering Ice Forest | Three close calls with wolves | 3 |
| 03 Crystal Mountains | Three close calls with falling crystals | 3 |
| 04 Frozen Ocean | Jump over four holes in the ice | 4 |
| 05 Frosted Dream Desert | Five close calls inside the mist | 5 |
| 06 Sky of Aurora | Two close calls right after a gust (within 30 m) | 2 |
| 07 Celestial Ice Palace | A close call with a wolf, a crystal and a hole | 1 each |

- A **close call** is an obstacle that comes level with Aisha within 0.3 m without touching her (the 6.3 near miss), counted per kind.
  A hole counts as **jumped** if she was in the air over it when it came level.
- **Only a completed level run counts**: not a crash, not Endless. It works at any difficulty level.
- **What it gives:** a badge (`◆` done, `◇` open) on the world card, and a line on the level-complete panel ("done!" or the progress, e.g. "40% / 90%").
  The badge is saved per world, kept for good, and changes nothing else: no stars, no unlocks, no advantage in play.
- Data: `src/runner/challenges.js` (one entry per world: text, goal, measure). Counting: `sim.tally` in the sim (passes, close calls by kind,
  close calls in thick mist or soon after a gust, holes jumped), reset every run. Saved as `challenge: true` per world (absent until earned).
- **Calibration, honestly:** I measured the Auto play bot (12 seeds per world): it finishes every level but takes **no** close calls with
  hazards (it keeps wide margins), and its orb share is 75-94%. So the close-call challenges cannot be won by just finishing (a test
  checks that the bot does not get its challenge for free), and World 01's 90% is right at the top of what the bot collects. The goal
  numbers (3, 4, 5, 2, 1 each) are **first guesses and not validated against a human player**: they may turn out too easy or too hard.
  They are constants in `challenges.js`.

## Tests (run here)
- `npm test`: 262/262 (new `tests/challenges.test.js`, 8 tests: every world has one; each is met exactly at its goal and not just below;
  crash and Endless never count; capped progress labels; the badge is saved only by a completed run, kept, and old saves keep their shape;
  save round trip and world cards; the sim tallies by kind, jumped holes (and a walked-in hole is a hit), mist and gust windows, and resets;
  the bot finishes the world but does not earn a close-call badge).
- `ONLY=challenge` 11/11 in headless Chrome: complete panel shows the challenge done and the badge is saved; a later run that falls short
  shows its progress and keeps the badge; stars unaffected; Endless shows no challenge; all 7 world cards list their challenge with the right
  badge; the complete panel with its extra line fits on a phone in portrait and landscape.
- Regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound,challenge` 222/222 (whole levels in the browser; the Retry/Restart button inside the viewport at 1534x630 and on phones).
- **Not verified:** how hard the goals are for a person, and whether close calls against moving wolves are easy or hard to get on purpose.

# Frost — Phase 6.2: sound (synthesized)

The game had no audio. There are no sound files in the repository and none could be supplied, so **everything is synthesized with
Web Audio at run time**: nothing to download, works offline, and easy to replace with recordings later (each sound is one recipe
in `src/runner/audio/sounds.js`). **I cannot hear anything from here**; what I could do is measure the output (see below). Whether it
sounds good is for you to judge, and the recipes are plain numbers meant to be tuned by ear.

- **What plays** (`audio/sounds.js` rules, `audio/engine.js` Web Audio): a start chime; footsteps that follow the run animation (one
  per 1.26 m, left and right differ); a puff for a jump and a thump for the landing; a swish for a lane change (panned to the
  side) and a duck; orb chimes that climb a pentatonic ladder for a chain (a pause starts again from the bottom); a whoosh for a
  near miss and for a gust; a crash for a hit; a four-note chime for a finished level; a soft wind bed that gets muffled in the
  mist. **Hazard warnings** play once when the telegraph starts: a growl for the wolf (from its side), a falling whistle for a
  crystal, an ice-crack for a hole.
- **Rules:** audio is created only inside a tap or key press (browsers refuse before one) and is suspended while the tab is hidden.
  **Sound is off for Auto play** and whenever the player turned it off: Settings > Sound, or the **M** key, remembered with the other
  settings. At most 14 sounds at once (the crash always gets through). A gentle limiter sits on the sum.
- **Nothing in the simulation changed.** Sound listens to the same events as vibration.
- **Levels were tuned from a measurement.** `node scripts/audio-report.mjs` renders every sound offline in headless Chromium (through the
  real engine, master gain and limiter) and reports peak and loudness. The first version was very quiet (peaks 0.05-0.2, `lane` and
  `duck` would have been inaudible, and the crash was not even the loudest sound), so each sound got a trim (`LEVEL` in `sounds.js`).
  Now: every sound peaks between 0.04 and 0.8, the crash is the loudest (0.61), footsteps are the quietest of the effects (0.043),
  and the worst moment (crash + three chimes + footsteps + wind + gust + near miss together) peaks at 0.83, under the limiter.
  This checks audibility and distortion only, not taste.

## Tests (run here)
- `npm test`: 254/254 (new `tests/sounds.test.js`, 10 tests of the rules; `tests/audio-engine.test.js`, 9 tests with a fake Web Audio:
  nothing before a gesture, no Web Audio handled, off / Auto play / suspended are silent, every event plays, orb chains climb,
  voice cap, footsteps, hazard warnings once, every recipe builds).
- `node scripts/audio-report.mjs`: the loudness table above; no silent, clipping or NaN sound.
- `ONLY=sound` 16/16 in headless Chrome with real Web Audio and the engine's own counters: no audio before the first tap, a tap unlocks
  it, start chime and footsteps, jump and landing, lane swish, two orb chimes, a crystal warning once, `M` mutes and unmutes (and
  is saved), nothing plays while muted, the crash, no page errors; Auto play makes no sound; a saved "off" is silent from the first frame.
- Regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality,sound` 211/211 (whole levels in the browser; the Retry/Restart button inside the viewport at 1534x630 and on phones).
- **Not verified:** how it sounds (taste, balance against music-less silence), loudness on real phone speakers and headphones,
  iOS Safari specifics (audio starts on the first tap by design). Real recordings or a music loop are the natural next step if you want them.

# Frost — Phase 6.1: quality tiers and a frame-time readout

I cannot test on a phone from here, so this PR builds the two things that make a real-device test possible and safe, and it does
**not** claim any real-device frame rate. Every frame-rate number in this project so far is still unmeasured on real hardware.

- **Tiers** (`src/runner/quality.js`): `high` > `low` > `min`. A tier changes only how the scene is drawn (pixel ratio 2 / 1.5 / 1,
  snow flakes, tree detail ranges); it never touches the simulation. Antialiasing is fixed when the canvas is created, so a live
  step-down cannot change it.
- **Adaptive** (Graphics: auto, the default): a visit starts on what the screen suggests (`low` on phones and small screens), or lower
  if this device was measured to need it (remembered in `localStorage`, `frost-runner-tier-v1`). A frame-time meter then steps the
  tier down when the average frame time over the last 90 frames is above 28 ms (under about 36 fps), after a 2.5 s warm-up and with a
  4 s cooldown between steps. It never steps up within a visit (no flapping), and stops at `min`. A single hitch or a tab switch
  counts as one frame capped at 250 ms, while a device whose every frame is that slow still reads as slow (found by a test: the first
  version discarded such frames and could never step down a very slow device).
- **Manual choices are exact:** Settings > Graphics `low` or `high` never changes. Settings shows the tier in use, e.g. "auto (high)".
- **URL flags for testing on a device:** `&fps` shows a live readout (`58 fps · avg 17.2 ms · p95 21 ms · tier high · 1170x2532px @3x`);
  `&tier=high|low|min` forces a tier; `&debug` runs (tests, budget scripts) never adapt unless `&adapt` is added, so measurements keep
  their tier.
- **Not changed:** the simulation, the budget scripts' numbers, and how any world looks at its start tier.

## Tests (run here)
- `npm test`: 235/235 (new `tests/quality.test.js`, 10 tests: tier order and cost, meter statistics, steady 60/40 fps never
  stepped down, a 20 fps device stepped down but not during warm-up, hitches capped, a 2.5 fps device still stepped down, cooldown
  and a fresh window before another step, saved tier and bad storage, start tier and manual choices).
- `ONLY=quality` 13/13 in headless Chrome at 800x600 with a pixel ratio of 2 (a slow software renderer, ~4 fps, makes a good slow
  device): starts on `high` (canvas 2x), steps to `low` (1.5x) and then `min` (1x) and stops, the readout shows fps, frame times and tier,
  the tier is remembered and used on the next visit, a manual `high` never steps down, `&tier=low` is exact, `&debug` alone never adapts,
  and the run keeps running normally.
- Regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline,quality` 195/195 (whole levels in the browser; the Retry/Restart button inside the viewport at 1534x630 and on phones).
- **Not measured:** any real phone. To measure one, open the game on it with `&fps` added to the address, play for a minute and
  send me the numbers in the readout (and what tier it settled on).

# Frost — Phase 6.7: technical health (load size, caching, offline, checks)

Measured with `node scripts/net-report.mjs <built-dir> [query]`: it serves a built folder itself (with ETags like a real static host)
and counts every byte it sends for a cold visit, a warm visit and a reload with no connection, headless Chromium.

| first visit (cold) | before (master) | after |
| --- | --- | --- |
| runner, World 02 (Worlds 03-07 load the same set, plus the wolf only in 02 and 07) | 14.44 MB | **10.65 MB** (-3.79 MB, -26%) |
| runner, World 01 | 12.69 MB | 12.70 MB (unchanged: it needs the massif) |
| original game | 4.26 MB | 4.26 MB (unchanged) |

All six numbers were measured with the same script on a build of master and a build of this branch.

- **No wasted 3.9 MB model.** `Distant.jsx` preloaded `mountain-massif.glb` the moment the runner's code loaded, so Worlds 02-07
  downloaded a model they never draw (they use a painted backdrop). Now only World 01 and the expedition ask for it; switching to
  World 01 in-page fetches it then (the scene keeps running; the mountains appear when it lands).
- **Vendor chunks** (`vite.config.js`): `three` (716 kB, 186 kB gzip) and `react` (219 kB) are separate, long-lived files, so an app
  change re-downloads only the small app chunks. The old 966 kB shared chunk is now 251 kB of app code plus those two.
- **Service worker** (`public/sw.js`, production only): pages network-first (a new deploy is always picked up, the last copy is the
  offline fallback), hashed JS/CSS cache-first, models and images stale-while-revalidate, everything else untouched; only OK
  responses are cached; old cache versions are deleted. After a full visit the game reloads and plays with no connection
  (checked in a browser, offline). A warm visit costs about 0 MB in this test because the host answers revalidations with 304; the
  worker's real addition is offline play, not bandwidth.
- **Headers** (`public/_headers`, Netlify): hashed JS/CSS `immutable` for a year, `sw.js` `no-cache`. I could not test these locally:
  check the deploy preview's response headers.
- **Checks:** `npm run check` (lint, unit tests, build) and a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs the
  same three on every pull request and push to master. The browser e2e and budget scripts are **not** in CI: they need Playwright
  with a software-GL Chromium, which is not a dependency of the project.
- **Still big, not touched:** `alpine-spruces.glb` 4.5 MB and `aisha.glb` 3.0 MB are the two biggest downloads. Shrinking them
  means re-compressing the models (texture size, quantization) and judging the look by eye; the original source files are not in the
  repository. That is the next lever.

## Tests (run here)
- `npm test`: 225/225 (new `tests/sw.test.js`, 6 tests: which requests the worker touches, versioned cache cleanup, network-first
  pages with offline fallback, cache-first hashed bundles, stale-while-revalidate media, failed/opaque responses never cached).
- `ONLY=offline` 10/10 (World 02 does not download the massif, World 01 and the expedition still do, switching to World 01 loads
  it with no page errors, the worker registers and controls the page, the game reloads with no connection and a run starts and
  moves offline).
- Full regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless,offline` 182/182 (whole levels in the browser with the service worker active; the Retry/Restart button inside the viewport at 1534x630 and on phones).
- Not verified: the Netlify headers, real-device load times, how much the spruces/Aisha models can be shrunk.

# Frost — Phase 6.6 (part 1): Endless mode

Plan item 6.6 lists three things (Endless mode, per-world star goals, cosmetic Aisha outfits) and says each is its own PR.
This PR is **Endless mode only**; the other two are not started.

- **What it is:** a world's own obstacles and hazards with no finish line. A crash ends the run. It opens for a world once that
  world is finished (or with `?unlock=all`). Start screen: "Endless" (shows your best).
- **Sim:** `startRun(sim, seed, { endless: true })`. The generator has no finish limit and the level-complete check is
  skipped. Mist banks and gust lines are periodic, so they carry on past the old finish line. The selected difficulty
  applies. Speed stays at the normal top speed; the generator stays at full difficulty (nothing else escalates yet).
- **Saving:** `bestEndless` per world in the progress save. `recordEndless` only moves that number: level bests, stars,
  completion and unlocks are never touched, and old saves have no such field. Scores stay on the device.
- **UI:** an "Endless" badge replaces the level progress bar, the finish gate is not drawn, the game-over panel says
  "Endless run" with the Endless best, Restart repeats the mode.
- **New "Menu" button** on the game-over and level-complete panels. There was no way back to the start screen (Worlds,
  Settings, Endless) after a run without reloading; Menu returns there and the next "Start run" is a normal level again.
- Auto play is unchanged (levels only).

## Tests (run here)
- `npm test`: 219/219 (new `tests/endless.test.js`, 8 tests: the bot runs past the finish line on all 7 worlds without a
  completion and with obstacles beyond it; a normal level still ends at the line; mist and gusts continue; difficulty
  applies; Endless saves only its own best; save round trip and old saves; when Endless opens; the bot survives 5 km on
  Hard in Worlds 01, 04 and 07). A separate probe of 8 km on Hard in all 7 worlds (2 seeds each) also ended with the bot still running.
- `ONLY=endless` 13/13 in headless Chrome (offered when open, badge and no progress bar, past the finish line the run goes on,
  "Endless run" panel, only the Endless best saved, Restart repeats, Menu returns, Start run is a level again, fresh save does
  not offer it, Restart and Menu inside the viewport at 390x844 and 844x390).
- Regression `ONLY=desktop,phone,auto,level,worlds,select,settings,feel,endless` 172/172 (whole levels in the browser, the Retry/Restart button inside the viewport at 1534x630 and on phones). Existing e2e selectors that assumed a single game-over button were updated for the new Menu button.
- Not verified: how Endless feels over a long session (the speed stops rising at the normal top speed, so it may feel flat after
  a few minutes: an escalation curve is the obvious next step if so), real-device play.

# Frost — Phase 6.5: difficulty levels and a balance report

The plan asked for human play-test notes first. There are none yet, so this PR does the parts that do not need them: it adds the
Easy / Normal / Hard option and a measuring tool, and it **does not change any Normal number**. Tuning Worlds 02-07 from how they
actually feel is still open and needs you to play them.

- **Difficulty** (`src/runner/sim/difficulty.js`; Settings > Difficulty; saved with the other settings; default Normal):
  - Easy: build-up takes 1.5x as long, gaps 20% wider, signature hazards (wolf, shard, hole patterns) x0.6.
  - Normal: identity. The same weights object and the same multipliers of 1, so rows, bests and the World 01 pins are unchanged.
  - Hard: build-up x0.7 as long, gaps 8% tighter, signature hazards x1.3.
  - It changes only the generator. Speed curve, jump, lane glide, collision boxes, the fairness floor (`REACTION`, `SHIFT_TIME`: no
    gap can be shorter than the rule needs) and each world's mist banks and gust lines are untouched. The chosen level is shown on
    the start screen. Auto play uses it too.
  - **Open decision for you:** stars and bests are recorded the same on every level, so 3 stars on Easy equals 3 stars on Hard.
    Options: leave it, cap Easy at 2 stars, or keep separate bests per level. I left it as is rather than guess.
- **Balance report** (`node scripts/difficulty-report.mjs [seeds]`, node only): runs the Auto play bot over every world and level
  and prints rows per 100 m, seconds per row, hazard share, near misses per 100 m, orb share and finish rate.
  Measured with 6 seeds per cell (the bot, not a person; near misses are a proxy for tight passes):

| world | level | rows/100 m | s/row | hazard % | close/100 m | orbs % | done |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | easy / normal / hard | 4.4 / 5.8 / 6.7 | 2.17 / 1.67 / 1.42 | 0 | 0.79 / 0.89 / 1.02 | 89 / 87 / 85 | 6/6 each |
| 02 | easy / normal / hard | 4.4 / 5.8 / 6.8 | 2.16 / 1.66 / 1.42 | 13 / 19 / 19 | 0.54 / 0.63 / 0.67 | 90 / 91 / 88 | 6/6 each |
| 03 | easy / normal / hard | 4.4 / 5.8 / 6.7 | 2.13 / 1.63 / 1.41 | 13 / 17 / 22 | 0.70 / 0.66 / 0.80 | 90 / 89 / 85 | 6/6 each |
| 04 | easy / normal / hard | 4.5 / 5.8 / 6.8 | 2.11 / 1.61 / 1.39 | 15 / 20 / 25 | 0.78 / 1.00 / 0.90 | 80 / 78 / 70 | 6/6 each |
| 05 | easy / normal / hard | 4.4 / 5.9 / 6.7 | 2.12 / 1.59 / 1.39 | 0 | 0.61 / 0.92 / 1.08 | 90 / 88 / 85 | 6/6 each |
| 06 | easy / normal / hard | 4.3 / 5.6 / 6.4 | 2.15 / 1.64 / 1.44 | 0 | 0.62 / 0.89 / 0.90 | 89 / 89 / 87 | 6/6 each |
| 07 | easy / normal / hard | 4.4 / 5.7 / 6.6 | 2.09 / 1.61 / 1.40 | 17 / 24 / 27 | 0.58 / 0.63 / 0.78 | 85 / 84 / 80 | 6/6 each |

  What this says, and what it does not: each level is clearly ordered (Easy has about 25% fewer rows than Normal, Hard about 16% more). At
  Normal the worlds are almost equally dense (5.6-5.9 rows per 100 m): their difference comes from the kind of obstacle, not how many.
  World 07 has the most hazard rows (24%) but not the bot's tightest passes, so the report alone does not show it as the hardest. World
  04 is the hardest for orbs (78% on Normal). This is the bot; whether Worlds 02-07 feel balanced for a person is not measured.

## Tests (run here)
- `npm test`: 211/211 (new `tests/difficulty.test.js`, 7 tests: Normal identical to the old generator, ordering of the levels, only
  hazard patterns scaled and world data untouched, the fairness floor on Worlds 02/04/07 at every level, mean gap and hazard share
  ordering, the bot finishes all 7 worlds x 3 levels x 2 seeds).
- `ONLY=settings` 20/20: the Difficulty button cycles and is saved, and a run started on Hard really uses it (`sim.difficulty`). Regression `ONLY=desktop,phone,auto,level,worlds,select,feel` 139/139 (includes whole levels in the browser and the Retry/Restart button at 1534x630).
- Not verified: how Easy and Hard feel to a person, real-device play.

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
