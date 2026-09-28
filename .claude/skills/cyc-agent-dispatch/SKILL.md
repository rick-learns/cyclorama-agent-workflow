---
name: cyc-agent-dispatch
description: How the Cyclorama lead runs parallel background agents and long herdr sessions in git worktrees and integrates their branches into main. Use when splitting work across agents or sessions, starting or chartering a long session, writing an agent brief, relaying a requirement change to a running agent, or verifying, merging and cleaning up a finished agent's worktree branch.
---

# Parallel agents: dispatch and integration

The human wants agentic work (memory note "TDD and agentic work"; DECISIONS 2026-09-26 [process]).
The lead keeps design authority, STATE.md, DECISIONS.md and canon. Agents build test-first in
isolated worktrees. Background and sources: `docs/process/AGENTIC_PRACTICES.md`.

## When to spawn
- Pick the place first: the lead (under ~15 min, control files, merges, deploys, approvals); a
  **long herdr session** when two of: open-ended, needs owner steering, past ~3 h, standing, or
  several deliverables under one design (a game, design to playtest) — see [sessions.md](sessions.md);
  else a bounded subagent (open-ended work run as subagents took 3 agents per deliverable across
  restarts, agent ledger 2026-09-27). A standing role is a per-wave job, never a standing subagent.
- One agent = one deliverable with one acceptance test, on files no other running agent owns,
  roughly 30 min to 3 h of work: a tool, a fix, a research fan-out, a review, art/music.
- Launch repo-wide mechanical jobs (headers, formatters) after a wave lands, not beside it.
- Don't spawn for work that needs the lead's context or an unmade design decision: decide first.
- Never split one design across agents. Shared files (`roms/lib/`, `tools/verify.ts`,
  `package.json`) have one owner per wave; catalogs are the exception (each builder appends its
  own entry, the lead union-merges them, step 3 below).

## Roles (`.claude/agents/`, tool limits and isolation built in)
`cyc-cartridge-builder`, `cyc-acceptance-verifier` (no edit tools), `cyc-outsider-reviewer`
(no project context), `cyc-skills-curator`, `cyc-canon-registrar`, `cyc-brand-historian`
(cannot edit canon.json). Pass `subagent_type: "<name>"`; use general-purpose with a ROLE line
for anything else. Hooks add to every agent (`.claude/settings.json`, scripts in `tools/hooks/`):
- **SubagentStart:** main's sha and the standing contract (own branch, specific paths, merge
  main before the final verify, test-first with observed results, `--test-concurrency=4`, inbox
  file, report under ~60 lines with evidence in files).
- **SubagentStop:** a building agent can't finish with uncommitted work or without its committed
  `.claude/skills/_inbox/<branch>.md` (asked once, then allowed).

## Limits (this machine)
- About **6–7 agents** at once, at most **2 heavy test runs** at once (full suite, Playwright):
  `node tools/slot.ts 2 -- node <script>` takes a machine-wide slot. Agents run suites with
  `--test-concurrency=4`. `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=10` is the hard cap.
- Timing-sensitive tests have flaked under load. **Rerun a failure alone before judging it.**
  If it recurs alone, fix the race (skill `cyc-verify`).
- Nested `.claude/worktrees/*` resolve `node_modules` from the main checkout; a sibling
  `../anotherFunGame-<name>` does not: run `npm ci` there. Agents never add or bump dependencies.

## Guard rails
- **Harness isolation** (hit by 7 agents in one wave): a worktree agent's command is refused
  as "too complex to verify" unless it provably stays inside the worktree (loops, `$(...)`,
  heredocs, `git -C`, `cd … &&` chains, paths containing "git"). Use one plain command per call
  with literal paths, files via Write/Edit, commit messages via `git commit -F <id>-msg.txt` (named
  for your agent id: the scratchpad is shared, a6006ce), hook scripts via `sh .githooks/<hook>`.
  Refused forms and workarounds: [guard-rails.md](guard-rails.md#harness-isolation).
- **`tools/agent-guard.ts`** (PreToolUse; tests `tests/agent-guard.test.ts`) blocks pushes and
  main-ref writes from worktrees, `git add -A` and deploys (even `deploy-site.ts --check`) from
  agents, checkout/switch/rebase in the shared checkout by anyone but the
  [checkout-lock](guard-rails.md#checkout-lock) holder, the lead's `cd` into worktrees, force
  pushes, `--no-verify`, bare `git stash` and destructive deletes ([full list](guard-rails.md#agent-guard)).
  A crashing or hanging guard blocks (fail-safe): fix the guard, never route around a block.
- **`.claude/` settings, hooks and agent definitions** change every session. Agents propose
  changes in their report or under `docs/process/`; the owner approves; the lead installs.
  (Skills-inbox files are the exception.)

## Dispatch
1. **Commit first.** Worktrees branch from the lead's HEAD; uncommitted work is invisible.
2. Write the brief from [brief-template.md](brief-template.md): 20–40 lines, versioned
   (`BRIEF v1 — <description> — main at <sha>`), ACCEPTANCE before deliverables, design docs
   linked by path, never paraphrased.
3. Launch with `run_in_background: true` (and `isolation: "worktree"` when not using a role that
   sets it). Note the agent in STATE.md "In flight (agents)".
4. Agents commit Conventional Commits messages (skill `cyc-iteration` §4: `type(scope): summary`,
   `Verified: <observed result>` for feat/fix/perf/canon) with `git commit -F <file>`, and check
   them with `node tools/commit-msg.ts --range main..HEAD` before reporting.

## Mid-flight changes
- `SendMessage` the delta only, numbered: "BRIEF v2: <what changed, why, deliverables affected>".
  The report's first line echoes the version it satisfied.
- Main moved under an agent: `node tools/hooks/agent-ledger.ts --since <agentId>` prints what
  landed since its launch. Send "main moved (<sha>): <files>. Run `git merge --no-edit main` now."
- If a change touches more than about a third of the deliverables, `TaskStop` the agent and
  spawn a new one with the corrected brief.

## Restarts and stopped agents
- A "background agents didn't finish" notice after a session ends names only that session's
  agents: list the running agents (ListAgents) before relaunching anything (5 duplicates, 2026-09-26).
- A stopped agent cannot be resumed by SendMessage. Spawn a new one that runs `git merge
  --no-edit worktree-agent-<old>` and reads the old worktree's uncommitted files by path. Commit
  WIP on the old branch first only where the pre-commit hook passes; never `--no-verify`.
  A resumed agent first folds any hook-made `wip(…)` commit (skill `cyc-iteration` §4).
- Files that must outlive the session go in the repo (runner scripts: `tools/infra/`), never the
  scratchpad, which disappears (2026-09-26). Session recovery: sessions.md "Handoff".

## Integration (branch merge)
Agents' branches are `worktree-agent-<id>`; the lead's own work sits on `<type>/<topic>` and
lands the same way. `main` changes only by the integrator's `--no-ff` merge (plus STATE.md/
DECISIONS.md-only commits; `.githooks/pre-push` refuses the rest). Run everything from the
**main checkout**; use branch refs or `git -C <worktree>`. One integrator only: a second lead
session works in its own worktree outside `.claude/worktrees` (e.g. `../anotherFunGame-hotfix`),
delivers `<type>/<topic>` branches and coordinates by SendMessage; never switch the shared
checkout's branch (4dba17e; the [checkout lock](guard-rails.md#checkout-lock) now refuses it).

0. **Verify before merging** (games, milestone claims, emulator/compiler/canon changes):
   - `node tools/test-integrity.ts main worktree-agent-<id>` (every code branch; seconds): exit 1
     means a deleted, skipped or weakened test, a hand-edited hash, or a narrowed test run. Stop
     and ask the agent (or reject) unless DECISIONS.md on the branch explains it.
   - `node tools/commit-msg.ts --range main..<branch>`: a branch from another session or machine
     skipped the hooks, and a bad message on main fails that push's CI run for good (d78be602).
     A branch behind main goes back to its author to merge main (skill `cyc-iteration` §4);
     when the owner needs it now, the lead merges and fixes in the merge commit (step 4).
   - Spawn `cyc-acceptance-verifier` with the branch, the report and the criterion. Merge only
     on ACCEPT (or ACCEPT WITH GAPS the lead records). Skip the verifier for docs/research.
   - Games: check the builder's done-list (skill `cyc-new-cartridge` §5.8) before spawning the
     verifier (the first wave's lead fixes were all done-list gaps: golden frames, canon, catalog).
1. Read the report (bounded; evidence is in the files it cites). Check the branch:
   `git log --oneline main..worktree-agent-<id>`, `git diff --stat main...worktree-agent-<id>`,
   then the real diff of the paths that matter.
2. Divergence: `git merge-base main worktree-agent-<id>`, then
   `git diff --stat <base> main -- <files the agent touched>` shows where conflicts will be.
3. **Confirm the checkout is on `main`** (`git branch --show-current`; a lead merge landed on a
   side branch twice, 4dba17e, c020d1d, before the checkout lock). Then
   `git merge --no-ff --no-commit worktree-agent-<id>`. Resolve conflicts by hand: shared
   files keep both sides, catalogs union by key, DECISIONS.md keeps both sides in order,
   generated files (manifest, golden frames, replays) are regenerated, never hand-merged, and
   lead-owned files (STATE.md, DECISIONS.md, canon.json) keep main's version with the agent's
   intent applied by the lead. Details: [merge-conflicts.md](merge-conflicts.md).
4. Verify the **merged tree**, not the branch: typecheck and the fast tier on the merge (a
   branch that turned on stricter flags broke code landed after it forked, 1576205), and on the
   merge of every pair of branches landing in one wave (two green branches broke together, run
   36283727442); then the agent's tests and `node tools/verify.ts --allow-dirty`. Rerun a flake
   alone before judging it. Lead fixes go into this merge (or onto the branch), never into a
   later direct commit on main.
5. Stage specific paths and conclude with `git commit -F <file>`: keep git's subject
   `Merge branch 'worktree-agent-<id>'`; the body names what landed with the evidence, then the
   Co-Authored-By trailer (skill `cyc-iteration` §4). After every push run
   `node tools/checkout-lock.ts pushed <merge>`: it has landed only on exit 0 ([pushing](merge-conflicts.md#pushing)).
6. Clean up once `git branch --merged main` lists it: `git worktree remove
   .claude/worktrees/agent-<id>`, then `git branch -d worktree-agent-<id>`. A `locked` worktree
   belongs to a running agent: leave it alone.

Branch can't be merged (e.g. nothing committed): [merge-conflicts.md](merge-conflicts.md#fallback).

## After each integration wave
- Spawn a fresh `cyc-skills-curator` (a bounded job per wave, never standing: DECISIONS
  2026-09-27 W-2) to fold every inbox file (not only when they pile up); read its fold
  table and act on CONFLICT / DECISION / PROPOSAL / RECURRENCE items. An urgent lesson (a flake
  cause, a broken command) goes to running agents by SendMessage now, and is folded at once.
  Never brief the curator to delete its own inbox file: the SubagentStop hook needs it committed
  on the curator's branch; the next fold deletes it (a1b00ae) (until the hook exempts the curator).
- Update STATE.md (In flight, evidence, one Next action) and append accepted DECISIONS.
- Send the owner **one wave summary**: what landed (verified, with numbers), what is in flight,
  up to 3 items from "Decisions for the owner", one thing to look at (skill `cyc-show-human`).
