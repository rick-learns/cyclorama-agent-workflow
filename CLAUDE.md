# CLAUDE.md — Avenell Cyclorama

A fictional 1987 console that is actually built: hardware spec, deterministic TypeScript emulator,
CYASM assembler, SCRIM compiler, cartridges, archaeology and museum. MISSION.md is the
authoritative specification.

## Always
- Start of every iteration: read STATE.md, run `npm run doctor` (a failing doctor blocks work), do
  exactly the one "Next action". Skill: `cyc-iteration`.
- Test first (red → green → commit only green). `npm run verify` is the global gate.
- Commit specific paths with a Conventional Commits message `type(scope)!: summary` (types feat, fix,
  test, docs, ci, build, perf, refactor, chore, canon, revert; imperative, no period, ≤ 100 chars),
  trailers `Verified: <observed result>` (required for feat/fix/perf/canon), optional `Milestone: M<n>`,
  then Co-Authored-By (`tools/commit-msg.ts`); append decisions to DECISIONS.md (append-only, dated);
  keep STATE.md current with exactly one next action.
- Core canon (canon/canon.json core, BIBLE.md) is immutable; new fiction is proposed, name-cleared
  by web search, then registered in canon.json `extended`. Skills: `cyc-canon`, `cyc-name-clearance`.
- The hardware never changes. Later games improve only through new techniques on the same spec.
- No placeholders, stubs, mocked games, fabricated results or screenshots as acceptance evidence.
- HALT conditions (MISSION.md) → write HALT.md and stop. After exactly three accepted production
  games: PLAYTEST_REQUEST.md + HALT.md until PLAYTEST_APPROVED.md exists. Skill: `cyc-playtest-checkpoint`.

## Working style
- Work goes to one of three places (owner, 2026-09-27): the lead (under ~15 min, control files,
  merges, deploys, design approvals); a bounded background subagent (one deliverable, one
  acceptance test, under ~3 h); or a long herdr session in its own `../anotherFunGame-<name>`
  worktree for open-ended, owner-steered or standing work (a game from design to playtest).
  Skill: `cyc-agent-dispatch` (+ `sessions.md`); roles in `.claude/agents/`. About 7 Claude
  agents in total (sessions plus all subagents), at most 2 heavy test runs; timing tests flake
  under load.
- Commit before dispatching: agent worktrees branch from the lead's HEAD (`worktree.baseRef:
  "head"`) and never see uncommitted work. Agents merge main before their final verify.
- Never `cd` into `.claude/worktrees/*` from the lead shell (the guard blocks it).
- Integrator: the MacBook lead merges and pushes `main` (DECISIONS 2026-09-26 [process/owner]); every other
  machine or session pushes branches only. Production (playcyclorama.com) deploys only verified `main` commits.
- The checkout at /Users/rick/dev/anotherFunGame belongs to the integrator and stays on `main`. Any other
  session (planning, CI, a second lead) never runs checkout/switch/rebase there: first
  `git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main` and work in that folder
  (the checkout lock enforces it). After every push of main: `node tools/checkout-lock.ts pushed <sha>`.
- Branches: don't work on `main`. Work goes on `<type>/<topic>` (kebab-case; types feat, fix, test,
  docs, ci, build, perf, refactor, chore, canon); agents keep `worktree-agent-<id>`. `main` stays
  green and deployable and changes only by the integrator's `git merge --no-ff <branch>` after
  verify + `node tools/test-integrity.ts`; the one exception is a commit touching only STATE.md
  and/or DECISIONS.md (`tools/push-policy.ts`). Previews: `npm run deploy` on a branch; `-- --prod` only on main.
- Worktree agents: one plain command per call (no loops, heredocs, $(...), git -C, cd … && chains); files via Write/Edit; commit via `git commit -F <file>` (file named for your agent id: the scratchpad is shared). New games: read `cyc-new-cartridge` §5 Speed first.
- Owner questions go in STATE.md "Decisions for the owner" (one line, recommended default, what
  proceeds meanwhile); one summary per integration wave, at most 3 decisions in it.
- When compacting, always preserve: agent ids, branches and descriptions in flight; owner
  decisions pending; the current Next action; any failing check and its log path.
- At a milestone boundary (or after two compactions) update STATE.md, commit, and ask the owner
  to start a fresh lead session from it instead of continuing on a compacted one.
- Node 24 native TypeScript: erasable syntax only, `.ts` import extensions, `import type`.
- Show the human real renders of real ROMs (skill `cyc-show-human`); the in-app browser needs the
  `build-static` preview server from `.claude/launch.json` for audio.

## Where things are
- Skills index: `.claude/skills/README.md`; agent roles `.claude/agents/`; hooks `.claude/settings.json`
  → `tools/hooks/`, command guard `tools/agent-guard.ts`; agent workflow `docs/process/`
- Hardware spec: `docs/manual/` (built), rulings `docs/spec-notes.md`; language `docs/scrim-spec.md`
- Emulator `src/machine`, assembler `src/asm`, compiler `src/scrim`, web `src/web`, app `src/app`
- Cartridges `roms/<name>/`, shared SDK `roms/lib/`, manifest `roms/manifest.json`, replays `replays/`
- Licensing tiers: LICENSING.md; brand policy: TRADEMARKS.md; business: docs/business/
- In-universe history research: `history/`
