---
name: cyc-iteration
description: The Avenell Cyclorama mission loop (MISSION.md PROJECT CONTROL). Use at the start of every work session or iteration on this repo, before committing, when updating STATE.md or DECISIONS.md, when deciding whether a milestone has passed, or when a HALT condition may have been hit.
---

# Cyclorama iteration loop

MISSION.md is the authority. CLAUDE.md at the repo root holds the always-loaded rules and points
here. This skill is the procedure.

## 1. Start: orient
1. Read `STATE.md` in full: current milestone, budget table, blockers, "Decisions for the
   owner", acceptance criterion, "In flight (agents)" and the single **Next action**. (The
   SessionStart hook prints a summary of these on startup, resume, clear and compaction.)
2. Check for stop files at the repo root:
   - `HALT.md` exists: stop. Report it to the human; do nothing else until they decide.
   - Checkpoint reached and no `PLAYTEST_APPROVED.md`: stop (skill `cyc-playtest-checkpoint`).
3. Run `npm run doctor`. A failing doctor blocks all other work: fix the toolchain first.
   - `node tools/doctor.ts --allow-dirty` only while agents' work is uncommitted in flight.
     Never use it to start an iteration on a tree that should be clean (DECISIONS 2026-09-26 [control]).
4. Skim the tail of `DECISIONS.md` for anything newer than STATE.md.

## 2. Do exactly the one Next action
- Take the smallest falsifiable increment. Don't widen scope or start a second thing.
- **Branch first** (§4 "Branches"; never work on main): the integrator branches in the shared
  checkout (`git switch -c <type>/<topic>`); every other session runs
  `git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main` and works there (the
  checkout lock blocks switching: skill `cyc-agent-dispatch` guard-rails.md "Checkout lock").
- **Test first** (red, then green, then refactor). See memory note "TDD and agentic work".
- Parallel work goes to background agents in worktrees (skill `cyc-agent-dispatch`). The lead
  keeps design authority and integrates.
- If the action touches fiction, run `cyc-name-clearance` and `cyc-canon` first.
  For a cartridge, use `cyc-new-cartridge`.

## 3. Test against the milestone's acceptance criterion
- The criterion is in STATE.md ("Current acceptance criterion") and MISSION.md for the milestone.
- Run the specific tests, then `node tools/verify.ts --allow-dirty` (skill `cyc-verify`).
- **Never mark a milestone passed without its acceptance checks passing.** Code existing is not
  passing. No placeholders, stubs, mocked games, fabricated results, or screenshots standing in
  for working behaviour. Concept renders are never acceptance evidence.

## 4. Commit (green only)
- **Gate the commit on the exit code** of the test or verify command, never on `grep` of its
  output: a grep that finds "fail 1" still succeeds, and the commit goes through (happened
  twice). Bash: `node tools/verify.ts --allow-dirty; rc=$?; [ $rc -eq 0 ] && git commit …`.
  PowerShell: `node tools/verify.ts --allow-dirty; if ($LASTEXITCODE -eq 0) { git commit … }`.
- Stage **specific paths**: `git add roms/foo tests/foo.test.ts replays/foo.replay.json`.
  Never `git add -A` / `git add .` (agent worktrees, `.tmp/`, stray build output). One missing
  pathspec (a moved or deleted path) makes the whole `git add` stage nothing: check
  `git status --short` after staging.
- **Git hooks (opt-in).** Once the clone's `core.hooksPath` points at `.githooks` (or a copy of
  it; shared by every worktree): `pre-commit` runs `tools/precommit.ts` (~4 s: no WAV, 2 MiB max
  per file, no `.env*`/`*.pem`/private keys, secret scan, typecheck, canon); `commit-msg` runs
  `tools/commit-msg.ts`; `pre-push` runs `tools/push-policy.ts`. A failure means fix it.
  **Never `--no-verify`** (the agent guard blocks it; skill `cyc-agent-dispatch`).
- **Branches** (owner decision 2026-09-26). Work goes on `<type>/<topic>`, kebab-case, types
  feat, fix, test, docs, ci, build, perf, refactor, chore, canon (`fix/slot-overlap`); agents keep
  `worktree-agent-<id>`; other machines and sessions push branches only. `main` is always green
  and deployable: only the integrator (the MacBook lead) changes it, by `git merge --no-ff
  <branch>` after verify and `node tools/test-integrity.ts main <branch>`. Exception: the
  integrator may commit directly on main when the commit touches only STATE.md and/or
  DECISIONS.md. The pre-push hook refuses any other direct commit on main and deleting main.
  Previews: `npm run deploy` on a branch; `npm run deploy -- --prod` only on main (lead only),
  then `npm run deploy -- --check` (read-only live check). Site, DNS, CI runner, credentials,
  rebuild and rollback: `docs/process/INFRASTRUCTURE.md`.
- **Hand over a branch merged with current main** (every session, machine and agent): `git fetch`,
  `git merge origin/main` into the branch, resolve conflicts there, then run typecheck,
  `npm run test:fast`, the test files the change touches, and `node tools/commit-msg.ts --range
  origin/main..HEAD` (other machines have no hooks). feat/site-front-door arrived 20 commits
  behind and failed main CI after the push, where no message can be amended (0ef9be5).
- **Message: Conventional Commits 1.0.** Check the message file before committing with
  `node tools/commit-msg.ts <message-file>` (exit 0 = conforming; works without the hook) and a
  branch with `node tools/commit-msg.ts --range main..HEAD`. Header `type(scope)!: summary`:
  types as for branches plus `revert`; scope optional kebab-case; summary imperative, no trailing
  period; header ≤ 100 chars. Long evidence goes in the body. The last paragraph holds the
  trailers: optional `Milestone: M<n>`, then `Verified: <observed result>` (**required for feat,
  fix, perf and canon**: counts, pass, a hash, never the command alone), then Co-Authored-By from
  the session's attribution instructions. Example, breaking changes and the exempt Merge/Revert/
  fixup! subjects: [commits.md](commits.md).
- **Worktree agents:** Write the message to a scratch file named for your agent id (the
  scratchpad is shared: a generic `msg1.txt` was overwritten twice) and `git commit -F <file>`;
  heredocs and `$(...)` are refused there (skill `cyc-agent-dispatch` "Harness isolation"). The
  lead, outside a worktree, may use a heredoc (`git commit -F - <<'EOF'` … `EOF`).
- **Check `git log -3` before committing on a resumed branch:** a session-end hook may have
  auto-committed the work as `wip(…)`; fold that unpushed commit with `git reset --soft <parent>`
  on your own branch, then commit properly (2049917 on worktree-agent-aababc5…).
- CI (`verify.yml`) runs impact-selected parts of verify on main pushes and PRs; branch pushes
  run nothing, nightly and weekly are off. Pre-merge: `gh workflow run verify --ref <branch>`
  (skill `cyc-verify` "CI"). Only the integrator pushes main, then runs
  `node tools/checkout-lock.ts pushed <sha>` (landed only on exit 0); subagents never push or deploy.

## 5. Update the control files (same or follow-up commit)
**STATE.md**
- Status table: bump **Used** for the milestone by one per iteration; change Status only on
  evidence.
- Add evidence under the milestone's evidence heading: commands run, hashes, test counts, and
  report paths.
- Keep "In flight (agents)" accurate.
- **Decisions for the owner** (above In flight) is the owner's queue. One line per open question:
  `- [D-n] (yes/no | name | click | restart) <question>. Recommended: <default + why>. Meanwhile: <what proceeds>.`
  Nothing blocks on a queued item: work proceeds on the recommended default. Owner actions are
  exact click paths or `gh` commands. Ask at most 3 per wave summary (AskUserQuestion for
  discrete choices). When answered, delete the line and append the answer to DECISIONS.md as
  "Owner decision: …". HALT conditions still go to HALT.md, not the queue.
- End with **exactly one** `## Next action`, concrete enough that a cold session can start it.
  At a milestone boundary, or after two compactions, make STATE.md the handoff and ask the owner
  to start a fresh lead session from it.

**DECISIONS.md** is append-only. Never edit a past line; supersede it with a new one. One line
per decision (architecture, canon, scope, compatibility, acceptance, process, licensing):
```
- YYYY-MM-DD [area] decision — reason
```
Areas in use: control, toolchain, build, runtime, audio, canon, canon/M4, M0-M4, M3/M4, M4 design,
M4 scope, M4 acceptance, verify, process, business/licensing, licensing, product, SLICE.
Record human choices as "Human decision/direction: …" so provenance is clear.

## Budgets are fixed
Budgets (STATE.md): M0 4, CANON 2, M1 6, M2 10, M3 12, SLICE 3, M4 36, M5 14, M6 8, M7 4.
- Never raise a budget silently.
- They may be re-baselined **once**, at the human playtest checkpoint, with a DECISIONS.md entry
  and human approval recorded in PLAYTEST_APPROVED.md.

## HALT conditions (MISSION.md): write HALT.md, then stop
1. The same underlying acceptance test is still failing after **three materially different**
   repair attempts.
2. Core canon or an existing canon entry would need **alteration** rather than an
   implementation fix.
3. Completion would require copyrighted or trademark-confusing fictional content.
4. A milestone consumes **more than twice** its fixed iteration budget without human
   authorisation.
5. A fundamental technical experiment disproves a requirement and no compliant alternative
   has been demonstrated.
6. The three-game playtest checkpoint is reached and `PLAYTEST_APPROVED.md` does not exist.

Use [templates/HALT.md](templates/HALT.md). Commit it (plus STATE.md with Blockers filled in and
Next action "Await human decision in HALT.md"), tell the human in one paragraph, then stop.

## Done means
M0–M6 passed, the checkpoint approved, ≥12 production games each with a passing replay,
byte-identical ROM rebuilds, conformance green, zero canon contradictions, museum offline smoke
green, and `npm run verify` exits 0 from a clean checkout. Then the one-page README and the
five closing lines (MISSION.md DONE).
