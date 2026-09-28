# Per-game acceptance checklist (M4)

Source: MISSION.md M3/M4/M6, DECISIONS.md (M4 acceptance, budgets, Curtain Up), SHADEWORKS and
SLICE TEST. Paste this into the game's integration report and fill in the evidence column.

| # | Requirement | Evidence (command, test name, hash, number) |
|---|---|---|
| 1 | Canon date chosen; ROM header date, title and size agree; registered in `canon.json` `extended.games`; `npm run canon` zero contradictions | |
| 2 | Name(s) web-cleared; DECISIONS.md entry with the evidence | |
| 3 | Technique legal for the date's era; hardware untouched (`git diff main -- src/machine` empty) | |
| 4 | Language recorded (SCRIM / CYASM); running mission count ≥3 SCRIM, ≥1 assembly | |
| 5 | Curtain Up first at power-on (first-party only); START skips from frame 30 | |
| 6 | Title screen | |
| 7 | How-to-play / understandable goal on screen | |
| 8 | Interactive core loop with meaningful challenge; HUD | |
| 9 | Pause | |
| 10 | Terminal win state (holds, or START returns to the title: both accepted, DECISIONS 2026-09-26 HOUSELIGHTS) | |
| 11 | Failure / game over or meaningful setback; START returns to title | |
| 12 | Continuous theme music + title/clear/game-over/win cues; SFX layered over music without cutting it | |
| 13 | Juice: hit flashes, light pulses, shake, jingles, tempo lift under pressure | |
| 14 | `GAME_STATE` word at a documented even RAM address, used by the game itself | |
| 15 | Tests: title, start, controls, music, scripted completion, failure path, determinism, no overruns, denylist on player text | |
| 16 | `node tools/build-roms.ts --write-manifest`: ROM in `roms/manifest.json`, byte-identical rebuild | |
| 17 | `node tools/budget.ts <name>`: OK (board fits and is legal for the date, no displayed-frame overruns, ≤16 sprites/line, ≤4 lights/line, ≤4 voices); record cpu max/p95 | |
| 18 | Completion replay `replays/<name>.replay.json` from power-on against the retail ROM; `node tools/replay.ts` PASS; hash recorded; golden frames recorded (`npm run golden -- --update`, only this ROM's entries changed) after the last ROM change and checked on the test's own completion run (`goldenRecorder`, game listed in `CHECKED_IN_GAME_TEST`) | |
| 19 | No debug cheats, test-only victory routes, altered ROMs or emulator-side state mutation | |
| 20 | `roms/<name>/README.md`: player instructions + developer note (GAME_STATE table, RAM map, techniques, budgets) | |
| 21 | `museum/catalog.json` entry with complete instructions; `node tools/build-museum.ts` OK; boots, plays with sound, save/load, eject in the museum | |
| 22 | Official app entry in `app/catalog.json` (+ achievements in `app/achievements.json`, each proven to unlock in the completion run); `npm run app` OK; every accepted game is in both catalogs | |
| 23 | Real-ROM screenshots in `.tmp/` shown to the human | |
| 24 | `node tools/verify.ts --allow-dirty` green; committed as `feat(<game>): …` with `Milestone:` and `Verified:` trailers (`cyc-iteration` §4) | |
| 25 | STATE.md M4 table updated; checkpoint count checked (exactly three → `cyc-playtest-checkpoint`) | |

Prototype and legendary cartridges also need: their pre-registered canon slot filled
(`pc-061-last-playhouse`, status `unreleased prototype`; `pc-060-uk-farewell`, status `legendary`),
with status affecting presentation and documentation only, never technical quality.
