# Project skills — Avenell Cyclorama

`CLAUDE.md` at the repo root holds the always-loaded rules and points here. MISSION.md is the
authority, and these skills are the established procedures. Each folder has a `SKILL.md`; long
templates and reference detail sit beside it. CI (`.github/workflows/verify.yml`) runs the
impact-selected parts of `npm run verify` on main pushes and PRs; branch pushes run nothing
(pre-merge: `gh workflow run verify --ref <branch>`; skill `cyc-verify` "CI"). Lessons wait in
[`_inbox/`](_inbox/README.md) until they are folded into the skills.

| Skill | Use when |
|---|---|
| [cyc-iteration](cyc-iteration/SKILL.md) | Starting any session or iteration; committing; updating STATE.md/DECISIONS.md; judging a milestone; HALT conditions and HALT.md |
| [cyc-agent-dispatch](cyc-agent-dispatch/SKILL.md) | Splitting work across background agents or long herdr sessions ([sessions](cyc-agent-dispatch/sessions.md)); the shared checkout's lock ([checkout lock](cyc-agent-dispatch/guard-rails.md#checkout-lock)); writing a brief ([template](cyc-agent-dispatch/brief-template.md)); agent roles (`.claude/agents/`); relaying a versioned change mid-flight; restarts and stopped agents; guard rails ([agent guard, harness isolation](cyc-agent-dispatch/guard-rails.md), `.claude/` proposals); test-integrity + acceptance verifier before merge; merging ([conflicts](cyc-agent-dispatch/merge-conflicts.md)) and removing an agent's worktree branch; one integrator; wave summaries |
| [cyc-name-clearance](cyc-name-clearance/SKILL.md) | Any new fiction name, character design or signature mechanic: web-search for collisions, record the evidence, recommend a cleared alternative ([precedents](cyc-name-clearance/examples.md)) |
| [cyc-canon](cyc-canon/SKILL.md) | Registering games or entities in `canon/canon.json` extended ([registrar reference](cyc-canon/registrar.md): entry shapes, `checkExtended`, pitfalls); reviewing PROPOSED_CANON; writing in-universe text (named rivals); `npm run canon`; implementation vs canon conflicts |
| [cyc-new-cartridge](cyc-new-cartridge/SKILL.md) | Designing, building, testing, replay-recording and shelving a cartridge; the per-game acceptance [checklist](cyc-new-cartridge/checklist.md); technique [eras](cyc-new-cartridge/eras.md) and raster budgets; the Speed section (time sinks of the first three games, the builder's done-list) |
| [cyc-scrim-game-patterns](cyc-scrim-game-patterns/SKILL.md) | Writing a SCRIM game: bank layout when code overflows bank 0 (FAR procs, bank-restoring helpers), frame loop and state machine, driver and Curtain Up calls across banks, LINE-interrupt splits and their cycle budget, compiler errors and workarounds ([code skeletons](cyc-scrim-game-patterns/reference.md)) |
| [cyc-completion-route](cyc-completion-route/SKILL.md) | Getting a deterministic completion replay fast: closed-loop route players, save-state route search, harness pitfalls, one emulation per game test (completion = golden-frame = metered run, clones for shared starts), the regeneration order for manifest, replay, goldens and budget ([harness code](cyc-completion-route/harness.md)) |
| [cyc-outsider-review](cyc-outsider-review/SKILL.md) | Proving an artifact usable from itself alone: review → numbered rulings → fixes → pinned tests → re-check; triaging human-pasted reviews |
| [cyc-assets-and-sound](cyc-assets-and-sound/SKILL.md) | `.art` / `.song` formats, the Cue Sound Driver, Curtain Up, SCRIM asset linking, concept renders, WAV rendering |
| [cyc-playtest-checkpoint](cyc-playtest-checkpoint/SKILL.md) | A production game was just accepted (count to three); writing PLAYTEST_REQUEST.md + HALT.md; resuming after PLAYTEST_APPROVED.md |
| [cyc-verify](cyc-verify/SKILL.md) | Running or diagnosing `npm run verify` (step logs in `.tmp/verify/`); flaky tests and browser races ([pitfalls](cyc-verify/pitfalls.md)); adding a verify step for new tooling; CI jobs, failure artifacts and workflow rules |
| [cyc-show-human](cyc-show-human/SKILL.md) | Showing the human real progress: museum via the `build-static` preview, screenshots ([shoot.ts](cyc-show-human/shoot.ts)), WAVs |
| [cyc-brand-mockups](cyc-brand-mockups/SKILL.md) | The real-world brand kit and website mockups in `brand/`: AI-tells checklist, token-only colours, committed sources and hash-pinned shots, provenance of emulator pictures, HTML/CSS/SVG screenshot pitfalls |
| [cyc-brand-history](cyc-brand-history/SKILL.md) | In-universe brand, marketing, sales, press, legends and cultural history (`history/`); artifact briefs; the director [brief](cyc-brand-history/director-brief.md) |
| [cyc-licensing-and-release](cyc-licensing-and-release/SKILL.md) | Choosing a new file's tier and SPDX header (`tools/spdx-lint.ts`, open → closed boundary test); brand rules (Curtain Up, "official", "Cyc"); the public-release gate and go-to-market order |

## Quick reference
- Start of an iteration: read STATE.md, `npm run doctor`, do the one Next action.
- Gate: `npm run verify` (clean tree), or `node tools/verify.ts --allow-dirty` mid-work. Commit
  only on its exit code 0; full step logs in `.tmp/verify/`.
- Branches and messages (skill `cyc-iteration` §4): work on `<type>/<topic>`, `main` only by the
  integrator's `merge --no-ff`, then `node tools/checkout-lock.ts pushed <sha>`;
  `type(scope)!: summary` + `Verified:` trailer. Sessions other than the integrator:
  `git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main`.
- New source file: tier it in LICENSING.md + `tools/licence-tiers.ts`, then `node tools/spdx-lint.ts --fix`.
- Git hooks (opt-in, owner runs `git config core.hooksPath .githooks`): pre-commit
  `tools/precommit.ts`, commit-msg `tools/commit-msg.ts`, pre-push `tools/push-policy.ts`.
  Claude Code settings: `.claude/settings.json` (deny rules; hooks in `tools/hooks/`: session
  orientation, agent contract, agent finish gate, agent ledger; command guard
  `tools/agent-guard.ts` behind a fail-safe wrapper). Agent roles: `.claude/agents/`.
- Agent branch checks: `node tools/test-integrity.ts main <branch>` · skills: `node tools/skills-lint.ts`
  · heavy-run slot: `node tools/slot.ts 2 -- node <script>`.
- ROMs: `node tools/build-roms.ts --write-manifest` · `node tools/replay.ts` · `npm run golden -- --update`
  · `node tools/budget.ts <name>` (that order after a ROM change; never hand-merge any of them).
- Iterating: `npm run test:fast` plus your own file; in PowerShell `npm.cmd run … -- <flags>`.
- Canon: `npm run canon` must print `canon: zero contradictions`.
- Museum: `node tools/build-museum.ts`, then preview `build-static` →
  `http://localhost:8177/museum/index.html`. Official app: `npm run app` → `/app/index.html`.
