---
name: cyc-new-cartridge
description: Build recipe and per-game acceptance checklist for a new Cyclorama cartridge (M4 production game, prototype, legendary cart, or dev-kit test cart), modelled on SHADEWORKS (CYASM) and SLICE TEST (SCRIM). Use when designing, building, testing, recording the completion replay for, or registering any ROM under roms/<name>/.
---

# New cartridge

Model cartridges:
- `roms/shadeworks/` with `tests/shadeworks.test.ts`: a production game in direct assembly.
- `roms/erg/` (banked, FAR code, LINE split) and `roms/houselights/` (one file, bank 0): full
  SCRIM production games; their idioms are in skill [cyc-scrim-game-patterns](../cyc-scrim-game-patterns/SKILL.md).
- `roms/slice-test/slice-test.scr` with `tests/slice.test.ts` and `docs/slice-gate.md`: the pipeline.
- `roms/sound-test/`: Cue Sound Driver plus Curtain Up.

The acceptance checklist is in [checklist.md](checklist.md), the README skeleton in
[templates/README.md](templates/README.md). Tick every item with evidence before calling a game
accepted. Replay and harness: skill [cyc-completion-route](../cyc-completion-route/SKILL.md).
**Read §5 Speed before starting.**

## 0. Decide before code (record in DECISIONS.md)
- **Canon date** and region set the technique era and the board ([eras.md](eras.md)): Lantern
  1987, Gel swap 1989, Flying 1990–91, Overdrive 1992, Follow-spot 1993–94. A title may use its
  era's technique and any earlier one, never a later one. **Never upgrade the hardware**, never
  touch `src/machine`. Flying and Follow-spot designs need their raster budget checked first.
- **Language:** SCRIM (`roms/<name>/<name>.scr`) or CYASM (`<name>.asm`). The mission needs ≥3
  shipped games substantially in SCRIM and ≥1 in direct assembly (SHADEWORKS). SCRIM carts link
  assets and the driver with `ASSET`/`LINK`/`EXTERN` (`docs/scrim-spec.md` §10).
- **Bank plan with code bytes:** a full SCRIM game is 11–16 KiB of code and overflows bank 0
  once the driver, Curtain Up and music are in (ERG). Choose layout A or B from
  `cyc-scrim-game-patterns` §1 before writing code.
- **Genre:** M4 needs ≥6 genres across ≥12 games. **One mechanic only this hardware produces**,
  legal in the chosen era.
- **Names cleared** (skill `cyc-name-clearance`): title, stages, songs, achievements, enemies.
  All of them are ROM bytes or catalog text; a late rename means re-recording everything.

## 1. Tests first (`tests/<name>.test.ts`)
Drive the retail ROM only through the controller port. Judge by RAM, VRAM, audio registers and the
rendered picture. Required tests (SHADEWORKS names in brackets):
- builds reproducibly; header title, date and size correct ["builds reproducibly as a 32 KiB Standard cartridge with the canon header"]
- power-on opens with Curtain Up and its chime, then the title ["power-on opens with the Curtain Up splash and chime, then the SHADEWORKS title"]
- after the splash, the game re-initialises what the splash leaves behind (work RAM, Cue wavetable
  and voices) ["after the splash the game re-initialises …"]
- START skips the splash from its frame 30, and a START still held is not a press on the title ["START skips the splash from its frame 30 …"]
- the title renders (text rows, lit logo) ["power-on shows the title screen …"]
- how-to-play screen reachable and returns ["C opens how-to-play …"]
- START begins play with the HUD; controls do what the README says; START pauses ["START begins puzzle 1 …"]
- theme plays during play, and effects sit on top without cutting it ["the theme plays during a puzzle …"].
  Require several distinct notes and the exact loop length: two sampled frames can land on the
  same note (SLICE TEST)
- scripted completion reaches the win state ["the scripted solution … reaches ALL SHADES SET"]
- failure path: game over, then START returns to the title ["burning out four bulbs ends in GAME OVER …"]
- no displayed-frame overruns (`overrunFrames === 0`), CPU p95 bounded (max includes blanked
  loads), sprites ≤16 per line ["every frame after start-up reaches WAI …"]
- determinism: the replay matches `replays/<name>.replay.json` ["the completion replay is deterministic …"]
- the app's achievements each unlock during the completion run, compiled against the real
  symbol table (HOUSELIGHTS, ERG)
- no real-world names in player-facing text and sources (denylist) ["player-facing text and sources use no real-world names"]

Whole-game files start with `// test-tier: slow`. Harness pitfalls (half-finished frames,
cached runs, vacuous assertions): `cyc-completion-route` §3.

## 2. Build it
- The first thing at power-on is `CALL CURTAIN_UP` (first-party titles only; it is a BRAND
  asset), before touching video or sound. See `roms/lib/curtainup.md` for the state it leaves.
  Place `SND_RAM` (272 bytes) clear of game variables and shadow OAM, below the stack, and
  document the address in the README (SHADEWORKS: `$8400-$850F`). Afterwards:
  - clear what the game relies on: work RAM, VRAM, CRAM; a game with its own sound code must
    also zero the Cue voice registers and the wavetable (the splash leaves a sine in it);
  - **seed the previous-pad state from the controller** right after `CURTAIN_UP` returns, so a
    START still held from skipping the splash is not a press on the title.
- Screens: Curtain Up → title → how to play → play with HUD → pause → win (terminal: holds, or
  returns to the title on START; both satisfy the rule) → failure/game over (or a meaningful
  setback) → back to title.
- Keep **`GAME_STATE` as a work-RAM word at a documented even address** (`$8000` in SHADEWORKS,
  ERG and HOUSELIGHTS). The game must use it to dispatch its own states: never a debug flag.
- Sound (human requirement): a continuous theme during play, plus title, clear, game-over and win
  cues; SFX layered over the music (voice borrowing); **juice**: hit flashes, light-field pulses,
  shake, jingles, a tempo lift under pressure (`SND_TEMPO`).
- Frame structure: the VBLANK handler acknowledges IF (and calls `SND_TICK`); the main loop
  waits (WAI), commits the frame's video writes, then runs one frame of logic. Whole-screen loads
  start at the top of vertical blank with the display off, and the display comes back on at a
  later vertical blank, never mid-frame. Hand-written sound code runs **after** the frame's game
  logic, or every effect starts one frame late (SLICE TEST).
- No debug cheats, no test-only routes, no level-select backdoors used by tests.

## 3. Pipeline (run from the repo root)
```sh
npm run scrim -- roms/<name>/<name>.scr -o .tmp/<name>.rom --report   # SCRIM: per-proc size/cycles
node --test --test-concurrency=4 tests/<name>.test.ts
```
Then, once the ROM bytes are final, in this order (`cyc-completion-route` §5): manifest
(`node tools/build-roms.ts --write-manifest`), replay (`recordReplay` behind
`<NAME>_WRITE_REPLAY=1`; `node tools/replay.ts` PASS), golden frames (`npm run golden --
--update`; tests fail until every replay has them; the game's test checks them on its own
completion run and the game joins `CHECKED_IN_GAME_TEST` in tests/golden-frames.test.ts, which
saves a whole extra emulation: `cyc-completion-route` §4), budget (`node tools/budget.ts <name>` OK).
Any later ROM byte change (a rename, Curtain Up, a text fix) repeats all four.

## 4. Register and shelve
- `museum/catalog.json`: `{ "rom", "title", "year", "blurb", "instructions" }`. The instructions
  must be complete player-facing text with the museum's keys: arrows, Z = A, X = B, C = C,
  Enter = Start. Then build the museum: `node tools/build-museum.ts`.
- Official app: append an entry to `app/catalog.json` (same fields plus `developer`, `genre`,
  `technique`, `status`, `thumbnailFrame`), and any RAM-rule achievements to
  `app/achievements.json`; `npm run app` must build.
- `canon/canon.json` `extended.games` entry (skill `cyc-canon`), then `npm run canon` must be
  clean. The lead registers it; a builder puts the exact JSON in its report. The legendary cart
  and the prototype fill the `title: null` slots (`pc-060-uk-farewell`, `pc-061-last-playhouse`).
- `roms/<name>/README.md` from the template: player instructions + developer note (GAME_STATE
  table, RAM map, banks, techniques, measured budgets, replay path).
- Screenshots of the real ROM into `.tmp/` for the human (skill `cyc-show-human`).
- `node tools/verify.ts --allow-dirty` must be green. Then commit specific paths (skill
  `cyc-iteration`) and update the STATE.md M4 table.

Count production games toward the playtest checkpoint only once every checklist item passes
(skill `cyc-playtest-checkpoint`).

## 5. Speed (games 4–12)
Measured: SHADEWORKS about 45 min (assembly, one bank, solver in the test). HOUSELIGHTS about
1 h 35 min to acceptance, ERG about 2 h 20 min. Where the time went, and the fix:
1. **Stale branch.** HOUSELIGHTS predated golden frames and the pre-commit tool (its commits
   failed until it merged main). `git merge --no-edit main` before the first line of code and
   again before the final verify.
2. **Bank 0 overflow found at the first compile** (ERG): make the bank plan and compile a
   stubbed skeleton with `--report` on day one (`cyc-scrim-game-patterns` §1).
3. **Compiler round trips** on reserved names and string tables: read
   `cyc-scrim-game-patterns` §5 before writing SCRIM.
4. **Harness bugs** (both games: half-finished frames; ERG: false "displayed" frames, a mutated
   cached run): copy the harness from `cyc-completion-route`, don't write a new one.
5. **Route by hand:** use the closed-loop player and the save-state repair search
   (`cyc-completion-route` §1–2); the design's model route never matches the ROM exactly.
6. **Re-recording churn:** names cleared late changed ROM bytes (HOUSELIGHTS). Clear every name
   before recording; record once, then regenerate manifest, replay, goldens and budget in order.
7. **Slow loops:** a 12,000-frame metered run takes about 60 s. Compute it once and share it;
   mark the game test `// test-tier: slow`; iterate with `npm run test:fast` plus your one file
   or `--test-name-pattern`; the full `npm test` or verify only at milestones (playable,
   recorded, done). In PowerShell use `npm.cmd run test:fast -- <flags>` (npm.ps1 drops `--`).
8. **Integration fixes by the lead** (both games): missing golden frames, canon entry, catalog
   entries, a vacuous assertion. The builder's done-list, all on the branch before reporting:
   tests green; manifest, replay, goldens and budget regenerated after the last ROM change;
   museum and app catalog entries appended (no reformatting); achievements pinned by the test;
   README; `node tools/test-integrity.ts main HEAD` exits 0; the canon `extended.games` JSON and
   DECISIONS lines (names, rulings) ready to paste in the report; main merged and verify green.
9. **Shared test files** edited by two parallel games conflict (tests/app.test.ts): make such a
   test read the data (the catalog), never hard-code your game into it.
