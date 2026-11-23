# Frost — The Frozen Trail (first playable)

Frost is a second, independent game in this project: a third-person 3D
mountain expedition with Aisha. The original **Frost Girl** endless runner is
unchanged and still launches on its own.

| URL | What loads |
| --- | --- |
| `/` | Game selection screen |
| `/?game=original` | Original Frost Girl runner (`src/App.jsx`, unchanged) |
| `/?game=frost` | Frost expedition (`src/expedition/`) |
| `/?game=frost&viewer=aisha&clip=walk&t=0.4` | Dev-only asset/clip viewer (`aisha`, `wolf`, `massif`, `forest`) |

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
node --max-old-space-size=12000 scripts/build-expedition-assets.mjs path/to/assets-source [aisha|wolf|massif|forest]
```

The script (gltf-transform + meshoptimizer + sharp, dev dependencies only)
merges Aisha's seven animation exports into one rigged GLB, remaps the Mixamo
bone names onto the Meshy skeleton (by hierarchy: Meshy's spine is
`Hips > Spine02 > Spine01 > Spine`), removes baked root motion from the sprint
and slide clips, decimates meshes and converts textures to WebP.

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
| `natures/alpine_winter_forest_.glb` | 351.7 MB | 7.66M tris — a grove of ~5 snowy spruces | Groves along the valley sides | ✅ in game |

Runtime outputs (`public/assets/expedition/`):

| File | Size | Triangles | Textures | Clips |
| --- | --- | --- | --- | --- |
| `aisha.glb` | 3.1 MB | 47.7k | 1K WebP ×3 | idle, walk, run, sprint, jump, land, slide, celebrate |
| `wolf.glb` | 1.5 MB | 10.2k | 1K WebP ×3 | walk, run |
| `mountain-massif.glb` | 3.9 MB | 83k | 2K WebP | — |
| `snow-pine-forest.glb` | 1.3 MB | 61k | 1K WebP | — |

## Known limitations

- The forest groves are aggressively decimated scans (shaggy up close); they
  are kept 11 m+ from the trail and distance-culled.
- No audio yet.
- Wolf has only walk/run clips: when it stops (alert/warn) it holds a walk
  frame with a lowered, growling crouch rather than a dedicated idle/growl clip.
- No dedicated fall clip: the airborne part of `Regular_Jump` is held.
- Performance measured on an integrated AMD Radeon GPU (headless Chrome,
  1280×720): ~48–50 fps, 110–150 draw calls, 1.0–1.2M triangles in view.
  Mobile hardware has not been tested on a real device (touch controls were
  tested with device emulation).
