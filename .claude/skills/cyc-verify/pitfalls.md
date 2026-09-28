# Verify pitfalls (detail for [SKILL.md](SKILL.md))

## Browser test races
Frames keep running between Playwright round trips, so any test that acts and then reads machine
state in a separate step can see an extra frame.
- **Act and read in one page task.** Do the key press or click and read the hash inside one
  `page.evaluate` (`keyThenHash` / `clickThenHash` in `tests/museum.test.ts`). Precedent: the
  museum eject and save/load tests (docs/slice-gate.md failure 5).
- **Or stop time:** install Playwright's clock (`page.clock.install`) and `page.clock.pauseAt(…)`
  before reading exact state (`tests/museum.test.ts`, `tests/app.test.ts`). Pause relative to the
  page's own clock (`pauseAt(await page.evaluate(() => Date.now()) + 2000)`), never at a fixed or
  precomputed time: a loaded machine passes it and Playwright throws "Cannot fast-forward to the
  past" (CI run 36277772516, app/museum `pauseClock`).
- **Prove "persisted" across pages without a race.** Chromium hands localStorage writes to other
  tabs asynchronously: close the writer page, open the reader on a blank page of the same origin
  with no storage-writing init script, `waitForFunction` until storage holds the value, then load
  the app once. Never read right after `ctx.newPage()` (app.test.ts "settings persist",
  'KeyZ' !== 'KeyJ', CI run 36276647768).
- **Or wait for a stable condition** with `page.waitForFunction` rather than a fixed delay.
- **After inserting a cartridge, wait until frames advance** before sending keys
  (`page.waitForFunction(() => (window.__museum.frames ?? 0) > 5)`): input listeners attach
  asynchronously, and an early F8 was lost (museum F8 race).
- **Hold a key aimed at the game until the game state changes; never tap it for a fixed time.**
  The pad is read once a frame and only once the screen accepts it (slice-museum "keyboard Enter
  starts the game" timed out on the throttled Mac, run 36285801363; site.test.ts, 267ccfe). An
  edge-triggered START gate is deterministic: find the first machine frame from which a held
  START works by running the served ROM in Node (snapshot, probe with START held), wait in the
  page until the machine frame passes it, then hold (ERG's title shows at 155, takes START from 220).
- **Judge real-time pacing on the page's own rAF timestamps** (an init script wrapping
  `requestAnimationFrame` logs `[now, frames]`), with bounds from the pacer: frames ≤ T/FRAME + 1
  and ≥ (T − Σ over gaps > 4 frames of (gap − 3 frames))/FRAME − 1, over ≥ 2.5 s of steady
  frames. A sleep with ±3 frames flakes whenever rAF stalls (browser-player.test.ts pacing).
- **`page.addInitScript` never runs on a `page.setContent` page** (about:blank): install such
  instrumentation with `page.evaluate` after `setContent` and before `addScriptTag`
  (tests/site-lightfield.test.ts read `window.__raf` as undefined until the switch).
- To test "Tab reaches control N", put a focusable element before the widget and `page.focus()` it
  first: `blur()` keeps Chromium's sequential-focus start point, so Tab lands after the blurred
  element (site-lightfield reached handle 3, not 0, after a touch drag on handle 2).
- Heavy parallel agents cause timing flakes: rerun the file alone once; if it recurs alone, the
  test has a race to fix. Never add retries.

## Test design
- **Never depend on the real repo's git state** (a local `main` ref, branch names, history
  depth, a clean tree): CI checks out one ref shallowly. Tests of hooks and tools that read git
  run on a fixture repo (`gitRepo()` in tests/hooks.test.ts, `CLAUDE_PROJECT_DIR=<dir>`); assert
  the fixture's exact sha, then remove the ref and assert the fallback (hooks.test.ts "main is at
  <sha>" failed on branch runs 36275575337, 36279442149). Reproduce CI's checkout locally with
  `git clone --depth 1 --single-branch --branch <b> file://<repo> <dir>` (plus
  `git checkout --detach` for a PR) and run the fast tier there.
- A "visible text" scan of a page (e.g. no standalone "Cyc") drops `<style>` blocks
  first: the manual's CSS has `td.cyc`, which a tag-stripping text() keeps (tests/site-docs.test.ts).
- To prove new code byte-identical to old code (a serializer, an encoder), extract
  `git archive <old-sha> src tools roms replays tests/conformance` into `.tmp/old/` and run the
  old code on the same inputs; the script must `process.chdir` to its own folder, because
  build-roms reads relative paths (savestate v2: all 7 v1 fixtures matched).
- **A test file never writes deployable build output** (`build/site`, `build/roms` …): each file
  builds into its own `.tmp/<file>` folder. Two files rebuilding build/site at once wiped each
  other's output (ENOENT build/site/manual/index.html, self-hosted Mac run 36286292303 at 4 files
  in parallel; guard test in tests/site.test.ts).
- Put dependent setup (build, then start a server on its output) in ONE top-level `before()`
  hook: two separate hooks overlapped, and the second read files the first had not written yet
  (tests/site.test.ts: ENOENT build/site/_headers in all 12 tests).
- **A load-then-re-save round trip cannot see a format drift the writer and reader share.** Pin
  frozen fixtures by rebuilding them from the source path and comparing bytes: with two fields
  swapped in both `Machine.scalars()` and `loadState`, the 7 round-trip cases in
  tests/savestate-v1.test.ts stayed green and the 7 rebuild cases failed.
- **A bound that always coincides with another event is invisible through the wrapper.**
  `runFrame`'s limit (the frame end) is always the line-0 video event, so a `limit` overshoot in
  `Machine.step` passed every runFrame comparison; test `Machine.step(limit)` directly with
  limits between events (tests/idle-fast-forward.test.ts, mutation-checked).
- **Never import one `*.test.ts` from another** (or from a script) to reuse helpers: node runs
  the imported file's tests too. Shared helpers live in a plain `tests/<name>.ts` module
  (`tools/source-scan.ts`).
- Prove "two processes overlap" with a **barrier** (each waits until both have started), never
  a fixed sleep window; compare "later start ≤ earlier end", because barrier runs end in either
  order (tests/slot.test.ts: the sleep version failed 1 in 4 under load; DECISIONS waiver).
- Never put a time assertion on an exact boundary: Windows mtimes can land a few ms after
  `Date.now()`, so `floor(days)` flipped 30 → 29 half the time (+30.5 days fixed it).
- Coverage (`--experimental-test-coverage`) slows the Tally interpreter about 20× (64 → 2.8
  MIPS): timing assertions skip when `process.env.NODE_V8_COVERAGE` is set, and coverage never
  runs inside `npm run verify`.
- The test tier is read from file content: a string like `"playwright"` in an import-looking
  template literal would make a file a browser test. Build such strings by concatenation
  (tests/test-tier.test.ts).
- Scripted edits: Python `open(p, "w")` on Windows writes CRLF; use `newline="\n"` or the Edit
  tool (`.gitattributes` forces LF).

## Tool CLIs
- Detect CLI mode with `isCliEntry(import.meta.url)` (`tools/cli-entry.ts`: the module's real
  path equals argv[1]'s real path). `endsWith` let `slice-replay.ts` run replay's CLI and a
  look-alike `foo-budget.ts` run budget's (9 tools converted); a per-tool filename regex still
  matches a same-named file elsewhere (`/tmp/…/tools/budget.ts`; `tests/cli-entry.test.ts`).
  Any other "is this file X?" match needs a path boundary (`(^|[\\/])X\.test\.ts$`):
  "shared.test.ts" contains "d.test.ts" (tools/ci-impact.ts).
- **PowerShell:** `npm run x -- --flag` loses the `--`; use
  `npm.cmd run test:fast -- --test-name-pattern=x`.
- **Never call `process.exit()` after writing a large block to a pipe or reading stdin with
  `readFileSync(0)`** on Windows (Node 23.11): it can abort with a libuv assertion
  (`UV_HANDLE_CLOSING`, exit 3221226505), and a hook doing that fails open silently. Set
  `process.exitCode` and return, or read stdin with `for await` (tools/agent-guard.ts). Child
  pipes in tests don't reproduce it; check the pattern statically (tests/hooks.test.ts).
  Reproduce by hand with `node tools/x.ts | cat`. (until Node is upgraded and re-tested)
- A CLI that forwards flags to another tool must also forward flags that arrive **without** a
  `--`: npm strips it (`test-tier.ts fast --test-name-pattern=x` ignored the pattern until
  `parseCli` passed every non-own flag through).
- Resolve TypeScript and other packages through module lookup
  (`createRequire(import.meta.url).resolve("typescript/bin/tsc")`, as `tools/verify.ts` does). A
  worktree under `.claude/worktrees/` has no `node_modules` of its own; lookup walks up to the
  main checkout's.

## Performance numbers
- Numbers on the shared machine vary up to 2× while agents run: report best-of-N (max MIPS,
  min ms). A/B a micro-optimisation by interleaving the variants in one process (a renderer read
  0.9–1.9 ms/frame at load 20+). A baseline gates only on its own hardware (TESTING.md).

## TypeScript
- With `exactOptionalPropertyTypes`, an optional field that code really sets to `undefined` (a
  cleared field, `x: maybe`) gets `| undefined` in its type. Don't reshape objects with
  conditional spreads instead: they change key sets that hashes and JSON see (all 14 such errors
  on the quality-guards branch: src/asm Stmt/Val, src/scrim Ann/Line, tools/budget BudgetOptions).

## CI workflow
- **Actions are pinned to full commit SHAs** with a `# vX.Y.Z` comment
  (`uses: actions/checkout@<40-hex> # v7.0.1`). Dependabot (`.github/dependabot.yml`) bumps SHA
  and comment together in one grouped weekly PR with a 7-day cooldown. Never switch back to
  `@v4`-style tags: once the owner enables "require SHA pinning", tag refs fail.
- Keep `permissions: contents: read` and `persist-credentials: false` on checkout.
- **Don't cache Playwright browsers** (Playwright's own guidance; the install takes about 28 s and
  the Linux deps can't be cached). The npm cache (`setup-node cache: npm`) stays.
- A CI step's per-file cost without a rerun: download the `verify-failure-*` artifact and add up
  the spec reporter's top-level test durations per file (serial at concurrency 1): erg.test.ts
  was 166 s of the 310 s slow tier, app.test.ts 86 s of the 113 s browser tier.
- A job whose checkout is wiped afterwards (the self-hosted runner's job-completed hook) must
  upload `.tmp/` on failure, or the failure shows only "TimeoutError" (run 36285801363 vs 36286292303).
- Self-hosted macOS runner: the LaunchDaemon must enter the runner user's launchd domain
  (`launchctl asuser <uid> sudo -u <user> …`); in the plain system domain headless Chromium dies
  with "bootstrap_look_up … MachPortRendezvousServer: Permission denied" (run 36285193008; setup
  and rollback: `tools/infra/setup-ghrunner.sh`, `rollback-ghrunner.sh`, docs/process/INFRASTRUCTURE.md).
- **ci-impact SAFE lists:** a new folder that no gate part reads (e.g. `tools/infra/` shell
  scripts) gets its own `BOTH` entry in tools/ci-impact.ts, or every change to it runs the full
  gate. The fake repo in tests/ci-impact.test.ts has no test files, so its classify assertions
  list only non-test paths (a tests/doctor.test.ts path there turned emulation and browser on).
- The impact step's `lint` range for commit-msg/push-policy is `before..after`, or the head
  commit only when `before` is zero (a push that creates the ref).
- `actions/upload-artifact` skips dot-directories like `.tmp/` unless `include-hidden-files: true`.
  Exclude WAVs (`!.tmp/**/*.wav`) to stay inside the 500 MB artifact quota.
- npm dependencies are exact-pinned and bumped by hand; Dependabot npm version updates are off
  (`open-pull-requests-limit: 0`). Merge a security-update PR only after `npm run verify` passes.
- `cancel-in-progress: false` does not queue runs: GitHub keeps one pending run per concurrency
  group and cancels the older pending one. Main uses a per-SHA group (`github.sha`) so every
  commit is verified; `queue: max` can't be combined with `cancel-in-progress: true`.
- A workflow change can only really be tested on GitHub: before merging, run it on the branch
  (`gh workflow run verify --ref <branch>`), then watch the first main run (`gh run watch`); a
  part step may show "skipped" only when the impact step's summary says it was not needed.
  Workflow files are never on a SAFE list, so such a push always runs every part.
- Parallel jobs are not free on a private repo: each bills its setup plus rounding to a whole
  minute (~3–4 more per run for 3 parts + aggregator; Windows 2×, macOS 10×). Keep one job;
  `CI_PARALLEL=true` is for the public repo; manual runs default to Ubuntu only. In that shape
  the aggregating job needs `if: ${{ !cancelled() && … }}`: without it a failed or skipped part
  skips the gate job too, and a skipped check counts as passing.
- `npm ci --ignore-scripts` in every job (no dependency code at install time). Adding a
  dependency with an install script fails `tests/workflows.test.ts`: first prove the package works
  without it (esbuild's only checks its binary), then add it to the pinned list. Installs also
  pass `--no-audit --no-fund --prefer-offline` under a step timeout: the audit call stalled one
  install 3 min 10 s (run 36283827558); only the supply-chain job audits, on purpose.
- verify runs each step detached (its own process group) so a timeout kills slot.ts, test-tier,
  `node --test` and its workers together; killing only the direct child left a grandchild holding
  the pipes, and the step hung until it exited (tests/verify-parts.test.ts, mutation-checked).
- A `workflow_dispatch` can be started from any branch: a self-hosted job's `if:` must pin
  `github.ref == 'refs/heads/main'` as a top-level `&&` conjunct, not only the event.
- An informational job that fails turns the whole run red, and the deploy gate reads the run's
  conclusion: give informational jobs `continue-on-error: true` and never run them on the gating
  event (main run 36277772516: a self-hosted Mac load flake blocked the deploy; fixed in 34f8e82).
- Hosted runners on the private repo have 2 vCPUs, so `node --test`'s default concurrency
  (cores − 1) is 1 and every file runs serially: each CI test step sets `CYC_TEST_CONCURRENCY`
  (run 36276647768: 456 s of test time in 468 s wall) (until the repo is public, 4 vCPUs).
- Background: docs/process/SECURITY_AND_PRACTICES.md (findings 14–24).
