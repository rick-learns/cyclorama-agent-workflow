---
name: cyc-verify
description: The Cyclorama global gate, npm run verify (tools/verify.ts). Use before any commit or milestone claim, when a verify step fails and needs diagnosis, when adding new tooling that must become part of the gate, when CI fails or the workflow changes, or when a test looks flaky.
---

# `npm run verify`

MISSION.md GLOBAL VERIFICATION: one clean-checkout command performs every non-interactive
acceptance check. `tools/verify.ts` runs each step as a **separate process**, prints
`PASS`/`FAIL` with timings, shows up to 25 matching error lines for each failure plus the path of
its full log, and exits 1 if any step failed. Every step is deterministic and local: a hosted
AI service (moving model aliases, undocumented determinism) is never a step in verify, CI, a
build or acceptance evidence; at most it suggests inputs that are then recorded as ordinary
replays.

## Current steps (read `tools/verify.ts` for the live list)
| # | Label | Command |
|---|---|---|
| 1 | doctor (toolchain, deps, browser, clean tree) | `node tools/doctor.ts` (+ `--allow-dirty` if passed to verify) |
| 2 | typecheck | `tsc -p tsconfig.json --noEmit` (resolved via `require.resolve`, so it works in worktrees) |
| 3 | rebuild all ROMs from source | `node tools/build-roms.ts` |
| 4 | cartridge resource budgets and completion replays (one metered run each) | `node tools/budget.ts` (judges every `replays/*.json`: hash, win, frames; never `--frames` in the gate) |
| 5 | conformance ROMs (Node) | `node tools/conformance.ts` |
| 6 | canon validation | `node tools/canon-check.ts` |
| 7 | skills lint (frontmatter, names, size, links) | `node tools/skills-lint.ts` (`npm run skills:lint`) |
| 8 | SPDX headers (each source file's licence tier, LICENSING.md) | `node tools/spdx-lint.ts` |
| 9 | museum page build (single offline file) | `node tools/build-museum.ts` |
| 10 | official app build (single offline file) | `node tools/build-app.ts` |
| 11, 12 | export / export-browser: the open SDK tree's own verify | `node tools/slot.ts 2 -- node tools/export-open.ts --verify .tmp/open-sdk[-browser] --part …` (static + emulation; browser); export problems fail `tests/export-open.test.ts` first (`export-open.ts --check`) |
| 13 | all tests (unit, ROM manifest hashes, golden frames, browser, replays) | `node tools/slot.ts 2 -- node tools/test-tier.ts all` |

Parts (`--part`): **static** 1–3, 5–11 + fast tier; **emulation** 4 + slow; **browser** 12 + browser. 6–12: `monorepo` only.

All node commands run with `--disable-warning=ExperimentalWarning`. The ROM-hash check against
`roms/manifest.json` happens in the tests (`tests/build-roms.test.ts`, the per-game tests) and in
the budget (replay) and museum steps, which refuse ROMs whose SHA-256 differs from the manifest.

**Step logs:** every run clears and rewrites `.tmp/verify/`, one file per step,
`NN-<first word of label>.log` (e.g. `.tmp/verify/13-all.log`), holding the command, exit code and
full output. Read the log before rerunning anything.

## Modes
- `npm run verify`: the real gate. It needs a **clean tree** (doctor). Use it before a milestone
  claim and after committing.
- `node tools/verify.ts --allow-dirty`: identical, except doctor accepts uncommitted changes. Use
  it mid-iteration and while integrating agents. `--allow-dirty` changes nothing else.
- `--part static|emulation|browser` (repeatable; `--list` prints the plan): one slice, as CI runs
  it. A part passing is never the gate; milestone claims need the full run.
- Gate commits on verify's **exit code**, never on grepping its output (skill `cyc-iteration`).
- The opt-in pre-commit hook (`tools/precommit.ts`) is a fast subset, not verify. It runs from
  the worktree (`core.hooksPath` is shared), so a branch cut before the tool landed can't commit:
  `git merge --no-edit main` first (HOUSELIGHTS); never bypass the hook.

## CI
- **One job, selected parts:** workflow `verify` (keep the name: the deploy gate reads a green
  `verify` run on main) runs ONE job per OS, `verify (ubuntu-24.04)`; its impact step
  (`tools/ci-impact.ts --github`) picks the parts and the commit-msg/push-policy `lint` range;
  parts run as steps `verify.ts --part <p>`. The fan-out `verify (parallel)` needs repo variable
  `CI_PARALLEL=true` (public repo: each extra job bills setup + a rounded minute).
- **When CI runs:** main pushes and PRs (impact-selected; PRs + Windows), manual runs. **Branch
  pushes and tags run nothing**; before merging run `gh workflow run verify --ref <branch>` (full
  gate, Ubuntu; inputs `parts`, `os`, `coverage`). Nightly disabled, weekly off (`CI_SCHEDULED`):
  **no periodic full run**, so dispatch a full run of main after each merge wave, and keep the
  SAFE lists conservative. The Mac job: manual runs of main only, `continue-on-error`.
- **Fail-safe allowlist:** emulation/browser skip only when EVERY changed file is on that part's
  `SAFE` list (main: since `before`; PR: its own commits). Unknown paths, lockfile, `.nvmrc`,
  tsconfig, workflows, emulator/ROM/replay/golden sources, a zero `before` ⇒ every part.
- **Policy** (`tests/workflows.test.ts`): SHA pins, a timeout per job, least privilege, no
  `${{ }}` in `run:`, `npm ci --ignore-scripts --no-audit` everywhere (esbuild's install script is the only
  one and not needed; a new one fails the test). actionlint + zizmor run on `.github/**` changes.
- **Hang protection:** every verify step has a timeout (~2× the slowest run; `--list` shows it)
  and is killed with its process tree (`FAIL <step> (timed out after …)`). test-tier's
  `--test-timeout=900000` bounds each FILE; a fast-tier file over 5 s warns: mark it slow or split it.
- **A new step or data file:** give the step a `part` in `STEP_TABLE`. If an emulation or browser
  file starts reading a path on that part's `SAFE` list, `tests/ci-impact.test.ts` fails: take
  the entry off the list (never silence the test). Keep CI free of git-ignored inputs (`build/`,
  `.tmp/`, `docs/concept/`), Windows paths and POSIX-only shell. No step or test reads a push
  `paths-ignore` path (`docs/process/**`, `history/**`, `research/**`, `docs/business/**`): pin
  such a doc through a gate-visible file that links it (site/README.md for the runbook;
  `tests/workflows.test.ts`). A new folder no part reads gets its own SAFE entry ([pitfalls](pitfalls.md#ci-workflow)).
- **Faster loops:** `npm run test:fast` (Node-only, ~25 s on the loaded Mac), `test:slow`,
  `test:browser`; `npm test` = all tiers. Tier by content (playwright import → browser;
  `// test-tier: slow` → slow; TESTING.md). PowerShell: [pitfalls.md](pitfalls.md#tool-clis).
- **On a CI failure**, download the `verify-failure-<os>-<run_id>-<attempt>` artifact (`.tmp/`
  minus WAVs, 7 days), read `.tmp/verify/<part>/*.log`, rerun
  `node tools/verify.ts --allow-dirty --part <part>`. Design and minutes:
  `docs/process/CI_BENCHMARK.md`; workflow rules: [pitfalls.md](pitfalls.md#ci-workflow). How CI,
  the Mac runner, the site, DNS and credentials run, rebuild and roll back: `docs/process/INFRASTRUCTURE.md`.

## Diagnosing a failing step
1. Read `.tmp/verify/NN-<step>.log`. Then rerun that step's tool **alone**, e.g.
   `node tools/budget.ts <name>`, `node tools/replay.ts`, `npm run canon`, `npm run typecheck`.
2. Tests: one file `node --test tests/<file>.test.ts`; one test
   `node --test --test-name-pattern="<substring>" tests/<file>.test.ts`. In the full log:
   `grep -n "not ok\|✖\|Error" .tmp/verify/11-all.log | head -40`.
3. Common causes:
   - **Skills lint:** fix the SKILL.md it names (frontmatter `name` = folder, a "Use when…"
     description, ≤ 150 lines, relative links that resolve); `npm run skills:lint` reruns it.
   - **SPDX headers:** tier the path in LICENSING.md and `tools/licence-tiers.ts` together, then
     `node tools/spdx-lint.ts --fix` (skill `cyc-licensing-and-release` "SPDX headers").
   - **Manifest mismatch** after a ROM source change: `node tools/build-roms.ts --write-manifest`,
     review `git diff roms/manifest.json`, then re-record that game's replay and golden frames.
   - **Replay hash mismatch:** the ROM or its input changed. Re-record only if the change is
     intended, in the order of skill `cyc-completion-route` §5. Never edit the expected hash by hand.
   - **Golden frames** (`tests/golden-frames.test.ts`): the picture at a replay checkpoint
     changed. Open `.tmp/golden/<rom>@<frame>.diff.png` (differing pixels magenta; in CI, the
     `verify-failure-*` artifact). Intended rendering change or re-recorded replay:
     `npm run golden -- --update` and say why in the commit. Otherwise it is a renderer bug.
   - **Canon:** unknown date or price in prose, a denylisted name, a hardware claim, or an
     extended-entry problem. Fix the text or entry, not the checker (skill `cyc-canon`).
   - **Doctor:** a wrong Node version (pinned 24.21.0 in `.nvmrc`), deps not at exact versions
     (`npm ci`), or chromium missing (`npx playwright install chromium`).
   - **Typecheck** only in a worktree: an import that resolves only from the checkout root.
     `exactOptionalPropertyTypes` errors: [pitfalls.md](pitfalls.md#typescript).

## Flaky under load
- Heavy runs (`npm test`, `npm run test:browser`, verify step 11) go through
  `node tools/slot.ts 2 --`: at most 2 at once machine-wide; a third prints `[slot] … busy` and
  waits. Dead-PID locks are reclaimed at once; after 20 min (`CYC_SLOT_MAX_WAIT_MS`) it runs
  anyway (`running without a slot`); CI skips it. `CYC_HEAVY_SLOTS=0` switches it off.
- Agent worktrees run tests with `--test-concurrency=4` automatically (tools/test-tier.ts);
  `CYC_TEST_CONCURRENCY=<n>|default` overrides. Details: TESTING.md "Shared machine".
- Timing-sensitive tests (browser pacer, museum save/load and eject, CPU benchmark floor) flake
  when several agents build at once. **Rerun the failing file alone once before judging.**
- If it fails again alone, or recurs, **fix the race, don't retry.** Patterns and fixes:
  [browser races](pitfalls.md#browser-test-races) (clocks, storage, START gates, pacing) and
  [test design](pitfalls.md#test-design) (git fixtures, barriers). Then five green full runs.
- Performance floors must not gate correctness (the CPU benchmark floor was lowered to 4 MIPS);
  performance lives in the TESTING.md baseline. Report best-of-N and A/B by interleaving in one
  process ([performance numbers](pitfalls.md#performance-numbers)).

## Adding a step for new tooling
1. The tool must be a CLI that exits non-zero on failure. Print failures with `FAIL` or `Error` in
   the line, because verify's summary only shows lines matching `/FAIL|fail|Error|error|✖/`.
2. Guard the CLI entry with `if (isCliEntry(import.meta.url))` from `tools/cli-entry.ts` (real
   path of the module = real path of argv[1]), not `endsWith` (`tests/cli-entry.test.ts` fails on
   it) or the older filename regex: a look-alike `foo-budget.ts` ran the budget CLI. Resolve packages
   through module lookup, never a hard-coded `node_modules/` path (worktrees have none of their own).
3. Test the tool itself first (`tests/<tool>.test.ts`), including one case proving it can fail.
   Run a branch-checking tool on its own branch before reporting (test-integrity flagged its own
   fixtures until it blanked string literals). CLI and test pitfalls: [pitfalls.md](pitfalls.md#tool-clis).
4. Add `{ part, label, cmd: [...node, "tools/<tool>.ts"] }` to `STEP_TABLE` in `tools/verify.ts`,
   ordered so its inputs are built first; whole-game work is `emulation`, Chromium `browser`, the
   rest `static`. Its log is named after the label's first word, so start the label with a
   distinct word. Add an `npm run <tool>` script if people run it by hand.
5. Adding or removing a step renumbers the logs: update the step table, step numbers and log
   names here (the SPDX step made the tests step 11), CONTRIBUTING.md "Running the checks", the
   STATE.md step count and DECISIONS.md (`[verify] … — reason`). A step that reads a
   `paths-ignore` path is wrong (see CI "A new step or data file").
6. Run `node tools/verify.ts --allow-dirty`, then commit.
