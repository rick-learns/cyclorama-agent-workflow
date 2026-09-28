---
name: cyc-completion-route
description: How to get a Cyclorama cartridge's deterministic completion replay fast - freeze the ROM bytes first, a closed-loop route player that reads game RAM but only drives the pads, route repair search from save states, recordReplay, one shared metered run for the replay and budget tests, harness pitfalls (half-finished frames, displayed-frame checks, mutated cached runs, vacuous assertions), and the order for regenerating manifest, replay and golden frames. Use when writing a game's completion or failure-path test, recording or re-recording replays/<name>.replay.json, or when a replay, budget or golden-frame check fails after a ROM change.
---

# Completion route and replay

Every production game needs a replay from power-on that reaches the win state
(`replays/<name>.replay.json`, checklist item 18). The same run feeds the budget report, the
golden frames, the achievements test and the museum's keyboard-completion test. Models:
`tests/erg-route.ts` + `tools/erg-route-search.ts` (platformer), `tests/houselights.test.ts`
(maze bot, metered), `tests/shadeworks.test.ts` (puzzle solver), `tools/slice-replay.ts` (fixed script).
Harness code to copy: [harness.md](harness.md).

## 0. Freeze the ROM bytes before recording
- Any ROM byte change (text, a song title, a late rename, Curtain Up) changes the SHA-256, and
  then the manifest, the replay and the golden frames must all be redone. Song titles are in the
  ROM (`SONG_x_TITLE`): HOUSELIGHTS renamed songs for clearance after it was playable and had to
  re-record. Clear **every** player-visible name (title, stages, songs, achievements) first.
- While iterating, the test asserts the win against its in-memory run; the file is written only
  behind an env flag (`<NAME>_WRITE_REPLAY=1`). Record at milestones, not after every edit.

## 1. The player: closed loop, pads only
- A route player reads game RAM each frame (the state word, the hero's position) to choose the
  next pad value, like a player watching the screen. It never writes machine state. Its per-frame
  pads become run-length `PadEntry[]` (`[frame, pad1, pad2]`; bits 1 Up, 2 Down, 4 Left,
  8 Right, 16 A, 32 B, 64 C, 128 START) for `recordReplay`; the replay itself is open loop
  (`tools/replay.ts` only feeds pads from a fresh power-on).
- Menus: press START a fixed number of frames after each state change (ERG: title +70, how to
  play +40), so a later timing change doesn't break the script.
- By genre:
  - **Scroller / platformer:** hold RIGHT plus position-triggered presses (design §17 format:
    `A<x>/<n>` jump holding A n frames, `B<x>` dash, `L<x>/<n>` hold LEFT, `W<x>/<n>` release),
    each fired when x first reaches the value (`RoutePlayer` in tests/erg-route.ts). After a lost
    life, resume at the first trigger ahead of the restart point.
  - **Maze / grid:** BFS over cells following the designer's completion rule, reading only cell
    flags and positions (`bfs` / `botPad` in tests/houselights.test.ts). It reproduced the
    design's reference stage-1 clear time exactly (1,280 frames).
  - **Puzzle:** a solver inside the test (SHADEWORKS).
- A design's §17 route comes from a reference model; the ROM differs by a few pixels. Repair
  it with a search (§2); don't hand-tune it frame by frame.

## 2. Route repair search from save states (minutes, not hours)
`tools/erg-route-search.ts` turned the design's model route into a no-damage ROM route with 7
local fixes, in minutes:
1. Play the stage, snapshotting `m.saveState()` and a cloned player every 4 frames.
2. Stop at trouble: hurt, life lost, or no progress for 150 frames.
3. Try local edits near the failure x: a new jump 6–200 px earlier (holds 20/12/6), a different
   hold or a removed press, a dash, a jump then an air dash, a brief stop.
4. Replay each from the latest snapshot before the edit; keep the first that gets 96 px past the
   trouble unharmed; continue from there.
5. `--write` stores the routes in the test's route file; the test replays them.

Copy it for a new game: change the trouble detector and the edit menu, keep the loop. The player
class needs `clone()`. Search is a dev tool: never search inside the test.

## 3. Harness pitfalls (both games hit the first one)
- **Half-finished frames.** Game logic runs past line 0, so right after `runFrame` RAM can be
  half-updated (a sconce counted as lit but not drawn; a Gogglet knocked out but no score yet).
  Observe at WAI: after `runFrame`, `step()` until the CPU is in `wait`, bounded by the next
  line 224, or hook `m.step` and act when `before === "run" && after === "wait"`. Both are
  hash-neutral ([harness.md](harness.md#observe-at-wai)).
- **Displayed-frame checks** use the step's **start** `masterCycle` and visible lines only: the
  last step of a frame ends at the next frame's line 0 and falsely marks blanked loads as shown.
- **Never mutate the cached completion run** in a later test (e.g. pressing START on it): copy
  it with `m2.loadState(r.m.saveState())`. The damage shows only in a full-file run.
- **Save states name their ROM** (v2, by SHA-256): `loadState` works only on the same ROM bytes;
  a patched copy throws SaveStateError "wrong-rom". `saveStateV1()` + `{ allowUnverifiedV1:
  true }` only for deliberate cross-build experiments (tests/savestate.test.ts).
- **`m.hash()` is FNV-1a of `saveStateV1()`**, not of `saveState()`: never hash the v2 bytes to
  compare with a replay or golden hash.
- **Every assertion must be able to fail.** No `assert.ok(x || true)`: ERG's vacuous assertion
  was removed at merge and needed a test-integrity waiver. Code that only drains state is plain
  code with a comment.
- **Failure-path bots** must not make the game safer by accident: block the cells or actions that
  trigger progress, and face away from the enemy before walking into it (HOUSELIGHTS' careless
  usher lit a sconce and the only Understudy froze for good).

## 4. Emulate the game once per test file (the slow part)
- A 12,000-frame run costs about 60 s on this emulator, so the cached closed-loop completion
  run is the file's only whole-game emulation. It is also the **golden-frame run**
  (`goldenRecorder("<rom>")`, `capture` right after each `runFrame`, before any harness
  stepping; assert `.results()`) and, when the test needs budget figures, the **metered run**
  (`budgetMeter(rom)`; steps taken between frames count toward the next frame). Then add the
  game to `CHECKED_IN_GAME_TEST` in tests/golden-frames.test.ts, or its goldens play again.
- **Never re-play the replay open-loop in the test.** Assert that the run equals the replay
  file (pads, frame count, final hash): recordReplay's hash comes from a plain run and verify's
  budget step replays the file, so that equality is the determinism proof (CI run 36276647768
  spent ~60 s per duplicate; tests/erg|houselights|shadeworks.test.ts).
- **Tests that start from the same point** (play start, a life lost) share one run through a
  `clone()`: `loadState(saveState())` plus the framebuffer and the harness's own counters, with
  one test proving a clone plays on exactly as a fresh power-on run: hash, picture and audio
  (tests/erg.test.ts `Run.clone`, `fromPlay`).
- Calling `budgetReport` directly: feed pads from an array (`pads: f => [pads[f] ?? 0, 0]`),
  never a function that scans run-length entries each frame (several times slower).
- Budget assertions: `violations` empty, `cpu.overrunFrames === 0`, and a bound on
  `cpu.busy.p95`. `busy.max` includes blanked loads, so never bound it.
- Pin the app's achievements in the same run: `compileAchievements` against the compiler's real
  symbol table, and require each to unlock (tests/houselights.test.ts, tests/erg.test.ts).
- Start the test file with `// test-tier: slow` so `npm run test:fast` skips it; during work run
  only your file or one test (`node --test --test-concurrency=4 --test-name-pattern="<name>" tests/<name>.test.ts`).

## 5. Record, then regenerate in this order
1. ROM bytes final (names cleared, text and music final).
2. `node tools/build-roms.ts --write-manifest`; `git diff roms/manifest.json` touches only your ROM.
3. Write the replay: `<NAME>_WRITE_REPLAY=1 node --test tests/<name>.test.ts` (PowerShell:
   `$env:<NAME>_WRITE_REPLAY=1; node --test tests/<name>.test.ts; Remove-Item Env:<NAME>_WRITE_REPLAY`).
   `recordReplay` refuses input that doesn't reach the win.
4. `node tools/replay.ts` prints PASS; record once more and check the file is byte-identical.
5. `npm run golden -- --update`; `git status tests/golden` shows only your ROM's PNGs and its
   `frames.json` entry; open the PNGs. Your test checks them on its own run (§4).
6. `node tools/budget.ts <name>` prints OK.

Any later ROM byte change repeats 2–6. Never edit a hash by hand. A hosted AI service may suggest
inputs, but only a recorded replay counts (skill `cyc-verify`).
