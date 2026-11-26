# Frost — upgrade plan (proposal, nothing here is built yet)

Where we are: the runner has 7 worlds with a signature hazard each, 3 stars per level, world select with unlocks, Auto
play as a test harness, 188 unit tests and browser e2e/perf scripts. What it still lacks, from inspecting the repo:
no audio at all, no real-device measurements, no settings/accessibility options beyond reduced-motion, the finale's
difficulty never played by a human.

Out of scope (your standing rules): monetization, shops, daily challenges, leaderboards/backends. World 01 and the original
game stay intact; Auto play stays; birds/skins stay cosmetic (no gameplay effect).

## 6.1 Real-device validation and quality tiers (do first)
Measure on at least one mid-range Android and one iPhone (fps over a full level in World 01 and World 07, thermal drift, heap).
Add automatic quality tiers (pixel ratio cap, pines/snow counts, backdrop resolution) chosen from measured frame time, with a
manual override. Done when: 60 fps target / 30 fps floor is met or the tier drops, with numbers in the docs.

## 6.2 Sound and music
Short, loopable assets; Web Audio, started on first tap (mobile rule). Footsteps on the beat of the run cycle, jump/land,
orb pickup (rising pitch for chains), hazard cues that double as warnings (wolf growl before the lunge, shard whistle,
ice crack, gust whoosh), per-world ambient bed and a calm music loop. Mute button and remembered setting.
Needs from you: music/SFX files or approval to synthesize placeholders.

## 6.3 Game feel and clarity
Haptics (short vibration on pickup/hit, behind a setting), a clearer hit/near-miss feedback, a three-second countdown on
restart, finish-line celebration with the Meshy `celebrate` clip already in the rig. Telegraph audit of every hazard on a
small phone screen (the gust chevrons are faint in my stills).

## 6.4 Onboarding, settings, accessibility
First-run controls hint (swipe/keys) that disappears after the first jump; a settings sheet (sound, haptics, reduced
motion, quality, left-handed layout); high-contrast hazard cues for colour-blind players; pause on tab hide (check).

## 6.5 Difficulty and balance pass
Human play-test notes for Worlds 02-07 (especially the finale), then tune pattern weights from data in
`runnerThemes.js`. Optional "Easy / Normal / Hard" that only changes spacing and hazard weights, never physics. The bot
becomes a regression gate: every difficulty must still finish on N seeds.

## 6.6 Content that fits the rules
Endless mode per world after the finish gate (scores local only), per-world star goals, a gallery of cosmetic Aisha outfits
unlocked by stars (cosmetic only, no shop). Each is a separate PR.

## 6.7 Technical health
Split the 963 kB GLTF/three chunk and lazy-load the original game and expedition, a service worker for offline play and
faster second loads, compress the remaining large GLBs, keep `npm run test:all`-style single command, run e2e in CI.

Order and size: 6.1 (small, high value) -> 6.2 (medium) -> 6.3/6.4 (small each) -> 6.5 (needs your play-testing) -> 6.6/6.7 as wanted.
