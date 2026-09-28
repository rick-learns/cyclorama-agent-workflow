# TESTING.md

## Correctness (machine behaviour)

| Suite | What it proves | Command |
|---|---|---|
| Unit tests | ISA decode, assembler, CPU, video renderer, audio chip, machine bus/timing, host pacing | `npm test` |
| Conformance ROMs | Hardware behaviour, written in the console's own assembly (`tests/conformance/*.asm`), judged by machine state (word 8000 = 600D), each run twice for identical state hashes | `npm run conformance` |
| Browser player | Built page in headless Chromium, offline from `file://`: real-time pacing, audio output, save/load, Node and Chrome state hashes equal after 300 scripted frames | part of `npm test` |

| Golden frames | The rendered picture (not just machine state) at fixed checkpoints of every completion replay hashes to `tests/golden/frames.json`; reference PNGs in `tests/golden/frames/` | part of `npm test`; `npm run golden` |
| SCRIM differential fuzz | Random INT/WORD/FIXED expressions compiled and run on the machine agree with a reference model; `SCRIM_FUZZ_SEEDS`, `SCRIM_FUZZ_SEED_BASE` widen or move the window | part of `npm test` (4 seeds); nightly (2,000 seeds, new window daily) |

Determinism rules: machine state is integer-only; the core never reads host time; the host only
decides how many whole frames to run (`src/web/pacing.ts`). Display refresh (60/120/144 Hz) changes
when frames are *shown*, never what is computed (`tests/web-host.test.ts`).

## Presentation performance baseline (named)

**Baseline "DEV-5800X-CR153"**: AMD Ryzen 7 5800X (8 cores / 16 threads), Windows 11 Pro,
headless Chromium 153.0.8010.12 (Playwright 1.63.0), Node 24.21.0.
Workload: LANTERN TEST cartridge (`roms/lantern-test`), 1,200 frames of `runFrame` + canvas
`present`, light field on, two 16×16 sprites, one BG layer, audio chip running.

| Measure | Result | Budget |
|---|---|---|
| Mean emulation + present per frame | 2.27 ms | 16.69 ms (one frame at 59.92 Hz) |
| p50 | 2.0 ms | |
| p99 | 3.7 ms | |
| Max | 117.8 ms (first frame: JIT warm-up) | |
| Real-time pacing, 3 s in-page run | frames = elapsed ÷ 16.688 ms ± 3 (tested) | |

Reproduce: `npm run perf`. Emulation correctness and presentation performance are separate
criteria: correctness is proven by the suites above on any machine; this baseline shows the
real-time workload fits well within the frame budget on the documented machine (about 14%).

Node-side numbers on the same machine (2026-09-26, `npm run bench`, best run of four sessions
while other agents were loading the machine, so re-measure when it is idle): Tally interpreter
77.5 MIPS; LANTERN TEST 2.72 ms/frame; SHADEWORKS replay 3.08 ms/frame; SLICE TEST replay
2.92 ms/frame. Under that load single runs varied by up to 2×, which is why `bench` reports the
best of 5 runs. Machine-readable copy: `tests/perf/baseline.json` (`tests/bench.test.ts`
keeps its name and Chromium numbers equal to the table above).

## Test tiers

`tools/test-tier.ts` sorts every `tests/**/*.test.ts` file by what it does, so new tests need no
list edits:

| Tier | Which files | Command | Local time (5800X) |
|---|---|---|---|
| fast | Node-only unit and integration tests | `npm run test:fast` | about 25 s (55 files; measured 2026-09-26 on the i7-9750H Mac under agent load, after the brand frame replay, 17 s on its own, moved to slow) |
| slow | Node-only files marked `// test-tier: slow` (whole-game playthroughs, golden frames, the brand mockup frame replay, long audio renders) | `npm run test:slow` | about 30 s (8 files) |
| browser | files that import `playwright` (headless Chromium) | `npm run test:browser` (heavy-run slot) | about 40 s (6 files) |
| all | everything | `npm test` (heavy-run slot; also step 11 of `npm run verify`) | about 50 s (files run in parallel) |

Use `test:fast` while iterating, `npm test` before committing, `npm run verify` as the gate.
Several tiers at once: `node tools/test-tier.ts fast,browser`. The tiers map to verify's parts
(`node tools/verify.ts --part static|emulation|browser`): fast → static, slow → emulation,
browser → browser; CI runs only the parts a change can reach, as steps of one job (parallel
jobs only with the repository variable `CI_PARALLEL=true`).
Extra `node --test` flags pass through: `npm run test:fast -- --test-name-pattern=SCRIM`
(in PowerShell write `npm.cmd run …` or quote `'--'`: PowerShell's `npm.ps1` swallows a bare `--`
and npm then takes the flag as its own config).
Mark a Node-only file slow when it alone takes more than about 5 s: test-tier prints a warning
(a `::warning::` annotation in CI; never a failure) naming every fast-tier file over 5 s.
**Hang protection:** test-tier passes `--test-timeout=900000`. With several files, node applies it
to each **file** as a whole (each runs in its own process under a file-level test), so it must
exceed the slowest file (erg.test.ts: 166 s in CI; a 180 s value killed four files in a loaded
run on the Mac); `CYC_TEST_TIMEOUT_MS=<ms>` or an explicit `--test-timeout` changes it, and
each `tools/verify.ts` step has its own timeout on top (`node tools/verify.ts --list`).

### Shared machine: heavy-run slots and concurrency

Several agents share one 16-thread machine, and timing tests flake under CPU contention, so:

- **Slot.** `npm test`, `npm run test:browser` and verify's test step run inside
  `node tools/slot.ts 2 -- …`: at most **2** of these heavy runs at once across the main
  checkout and every worktree (lock directories in `<git common dir>/cyc-slots/`). A third waits
  and prints `[slot] … busy`. `test:fast` and `test:slow` take no slot. A lock whose owner PID is
  gone (a killed run) or that is older than 3 h is reclaimed at once.
- **Never hangs.** Under CI (`CI=true`, one run per runner) the slot is skipped. After
  `CYC_SLOT_MAX_WAIT_MS` (default 20 min) of waiting it runs anyway and says
  `running without a slot`. `CYC_HEAVY_SLOTS=<n>` changes the count, `0` switches the slot off.
- **Concurrency.** `tools/test-tier.ts` passes `--test-concurrency=4` in agent worktrees
  (`.claude/worktrees/*`); the main checkout keeps Node's default (cores − 1). CI's 2-vCPU
  runners would run one file at a time, so `verify.yml` sets `CYC_TEST_CONCURRENCY=2` for the
  static and emulation parts (the browser part keeps the default; to be confirmed against the
  first part-job run's step times, docs/process/CI_BENCHMARK.md "Actions minutes").
  `CYC_TEST_CONCURRENCY=<n>` (or `default`) overrides it; so does an explicit
  `-- --test-concurrency=<n>`.

## Golden frames

Like Dolphin's FifoCI and mGBA's CInema, but small: `tools/golden-frames.ts` plays each completion
replay from power-on and hashes the 256×224 picture after the first 60 frames, at each quartile and
at the final frame. The replay's state hash covers RAM, VRAM, registers, CPU and audio, but not the
renderer's output, so this is what catches a video regression. On a mismatch it writes
`<rom>@<frame>.actual.png`, `.expected.png` and `.diff.png` (differing pixels magenta over a
dimmed copy) to `.tmp/golden/`, which CI uploads with the failure logs.

- A new replay-backed cartridge must add its goldens (a test checks every replay has them):
  `npm run golden -- --update`.
- An intended rendering change: regenerate the same way, look at the new PNGs, and say why in the
  commit. Never regenerate to make an unexplained failure go away.

## Coverage

`npm run coverage` runs the Node tiers under node's built-in `--experimental-test-coverage` (no
dependencies) and writes `.tmp/coverage/lcov.info`, `summary.json` and `summary.md`. Browser-tier
code runs inside Chromium and is not measured. Node only reports files that some test loads, so
the percentages describe loaded code.

First measurement (2026-09-26): lines 97.1–97.7 %, branches 92.2–92.3 %, functions 94.9–96.6 %
(fast tier – all Node tiers). **Initial thresholds, report-only: lines 95 %, branches 90 %,
functions 93 %** (`tools/coverage.ts`). A shortfall is printed as a warning; `--enforce` would
make it fail, and is for the owner to switch on once the numbers have been stable for a few weeks.
Instrumentation slows the emulator 5–20×, so coverage runs nightly (and on pull requests for the
fast tier), never inside `npm run verify`; timing tests skip themselves under it.

## Nightly performance report

`npm run bench` measures the numbers above (add `--browser` for the Chromium presentation
workload) and compares them with `tests/perf/baseline.json` and with any `--against <bench.json>`.
A metric more than 25 % slower is a regression. On other hardware the named baseline is context
only; the nightly workflow compares each night with the previous night on the same runner image,
warns in the run summary, and keeps every report as an artifact for 30 days. Performance never
fails the gate.
