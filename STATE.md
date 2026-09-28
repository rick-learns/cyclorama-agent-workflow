# STATE.md

## Current milestone: M5 — Archaeology + canon validator (M4 PASSED 2026-09-27; ERG live at www.playcyclorama.com)

## State machine
| # | Milestone | Status | Budget | Used |
|---|-----------|--------|-------:|-----:|
| M0 | Distinct & feasible (RESEARCH.md) | PASSED | 4 | 2 |
| CANON | Canon freeze (BIBLE.md, canon/canon.json) | PASSED | 2 | 1 |
| M1 | Hardware & programmer manual | PASSED | 6 | 4 |
| M2 | Emulator + conformance ROMs | PASSED | 10 | 4 |
| M3 | Assembler, compiler, debugger, reproducible builds | PASSED (tooling; "3 SCRIM games" verified in M4) | 12 | 3 |
| SLICE | Slice gate test cartridge end to end | PASSED | 3 | 1 |
| M4 | Library (owner-reduced 2026-09-27: trio + INKLIGHT; no 10-game lineup) | PASSED 2026-09-27 (4 accepted: SHADEWORKS, ERG, HOUSELIGHTS, INKLIGHT; owner scope DECISIONS 2026-09-27 [M4 scope]) | 40 | 5 |
| CHECKPOINT | Human playtest after 3 games | PASSED (PLAYTEST_APPROVED.md, 2026-09-26) | — | — |
| M5 | Archaeology + canon validator | pending | 14 | 0 |
| M6 | Museum, offline smoke tests | pending | 8 | 0 |
| M7 | Optional mystery | pending | 4 | 0 |

## Blockers
None.

## Decisions for the owner
One line each: id, kind, question, recommended default, what proceeds meanwhile (nothing waits on
these). The SessionStart hook prints this list; wave summaries ask at most 3. Remove a line when
answered and record the answer in DECISIONS.md.
- [D-13] (licensing) Relicense examples/, docs/manual/examples/ and the SCRIM compiler's start-up template under Apache-2.0 WITH LLVM-exception, so ROMs that reuse them need no attribution. Recommended: yes. Meanwhile: README and LICENSING state accurately that they are plain Apache-2.0.
- [D-8] (scheduled) Biome 2.5.14 lint/format — approved; feat/inklight has landed, so it is the next lead branch.

## Current acceptance criterion (M4 release) — MET 2026-09-27
www.playcyclorama.com serves ERG, /manual/ and /scrim/ (tag site/2026-09-27.1, main 34f8e82). Site redesign (feat/site-front-door: home around light, /erg/, /shadeworks/, /houselights/, light-field demo) live as site/2026-09-27.3 (main 154ca70, verify run 36289419045). Next M4 criterion: the next unfinished title per docs/games/LINEUP_PROPOSAL.md and skill cyc-new-cartridge.

## How work runs now (2026-09-27; details in DECISIONS.md)
- Integrator: the MacBook lead, from the shared checkout /Users/rick/dev/anotherFunGame on `main`. Everything else is a branch `<type>/<topic>` (agents: `worktree-agent-<id>`) merged `--no-ff`; only STATE.md/DECISIONS.md-only commits go straight to main. Hooks in .git/hooks-mac enforce Conventional Commits (`type(scope): summary`, `Verified:` trailer for feat/fix/perf/canon, last paragraph with Co-Authored-By) and the main push policy. The Windows PC and other clones push branches only (no hooks there: `git config core.hooksPath .githooks`).
- CI: `verify` runs on main pushes only, impact-selected (docs/web-only pushes run the static part, about 1 min; full gate about 5 min on Ubuntu). No branch or tag runs. Pre-merge check when wanted: `gh workflow run verify --ref <branch>` (Ubuntu full gate, about 15 billed minutes). Nightly disabled (`gh workflow enable nightly` to restore); weekly gated on repo var CI_SCHEDULED (unset = off). Safety net: dispatch `gh workflow run verify --ref main` after each merge wave (it also runs the self-hosted Mac job, informational only).
- Deploy: `npm run deploy` on a branch = Cloudflare preview; `npm run deploy -- --prod` on main needs a green verify run on HEAD (or only CI-skipped commits above one), tags site/YYYY-MM-DD.N. Token: ~/.config/playcyclorama.env (90-day expiry, owner renews with save-cloudflare-token). Subagents cannot deploy or read the token (guard + settings deny). Owner has pre-authorized deploys.
- Local heavy tests: at most 2 at once (tools/slot.ts); prefer GitHub dispatch for full verifies when the Mac is loaded.

## Completed
- CANON (iteration 3): canon/canon.json + BIBLE.md frozen; npm run canon passes with zero contradictions; 12 tests incl. 9 seeded-contradiction detections.
- M0 (iterations 1-2): repo, pinned toolchain, doctor; research reports x3; experiments E1-E5; RESEARCH.md with prior-art matrix, equivalence check and risk register F1-F17. Verdict PASSED.

## M1 acceptance evidence
Outsider review (research/m1-review.md) -> rulings (docs/spec-notes.md §9-§10) -> fixes -> independent re-check (research/m1-recheck.md: 24/26 resolved + new issues) -> rulings §11 -> fixes; tests/review-fixes, manual-review2, manual-recheck (49 tests) pin every item against the built manual. Canon: zero contradictions.

## M2 acceptance evidence
15 conformance ROMs in CYASM (tests/conformance, ~1,200 checks: ALU, memory, branches, stack, shifts/mul, cycle counts, interrupts, banks, cartridge RAM, video ports, DMA, interrupt timing, light field incl. per-line latching, audio, input), each proven able to fail; pass in Node and Chromium with identical state hashes; 60/120/144 Hz pacing gives identical state; save/load round trips; TESTING.md baseline DEV-5800X-CR153 (2.27 ms/frame).

## M3 acceptance criterion
Assembler (done), linker/cartridge packer, compiler for SCRIM (docs/scrim-spec.md) emitting native Tally code; >=3 shipped games substantially SCRIM, >=1 in direct assembly; browser debugger (pause/resume, step instruction/frame, registers, flags, disassembly, memory, VRAM, breakpoints, bank inspection, light-field state); reproducible clean-checkout builds with byte-identical ROMs recorded in a build manifest. Then the SLICE gate.

## M3 acceptance evidence
CYASM assembler + disassembler; SCRIM compiler emitting native Tally code through CYASM (86 tests: emulator-run semantics, 29 checked errors, differential fuzzing vs a reference model, determinism); browser debugger (pause/resume, step instruction/frame, registers, flags, disassembly, memory, VRAM/OAM/CRAM, breakpoints + watchpoints, bank/header, light-field state + shade overlay; Playwright offline); asset converter; reproducible builds (17 ROMs rebuilt twice byte-identically against roms/manifest.json); budget reports; completion-replay runner; npm run verify (9 steps). The M3 criterion "≥3 shipped games substantially SCRIM, ≥1 in direct assembly" is checked as part of M4 acceptance (ERG and HOUSELIGHTS in SCRIM, SHADEWORKS in assembly).

## SLICE evidence
docs/slice-gate.md: roms/slice-test (SCRIM) rebuilt byte-identically (manifest), budget OK, completion replay hash 527b556e, museum play in Chromium offline: audible tune, keyboard + gamepad, save/restore determinism, keyboard completion reaches the replay hash, clean eject + power-on re-insert. Integration fixes landed with tests.

## M4 progress (pre-playtest set)
| Game | Genre | Language | Status |
|---|---|---|---|
| SHADEWORKS (1987-09-18) | puzzle | CYASM | ACCEPTED: Curtain Up splash, 10 puzzles, theme + SFX, replay df9e9aef (2521 frames, GAME_STATE $8000=7), budget OK, on museum shelf |
| ERG: NIGHTSIDE RUN (1987-09-18) | platformer | SCRIM | ACCEPTED: replay f3aa5734 (10,162 frames), budget OK, independently verified, canon registered, on museum/app shelves |
| HOUSELIGHTS (1987-10-16) | maze action | SCRIM | ACCEPTED: replay 1aacbfbd (12,018 frames), budget OK, independently verified, canon registered, on museum/app shelves |
All three accepted; the playtest checkpoint PASSED (PLAYTEST_APPROVED.md).

## M4 progress (post-playtest)
| Game | Genre | Language | Status |
|---|---|---|---|
| INKLIGHT (1989, Logiciels Soupirail) | action-adventure | SCRIM | ACCEPTED 2026-09-27: replay ddfcd35a (8,802 frames, WIN), budget p95 34.4 %, 0 displayed overruns, 27/27 game tests, independently verified (76ee474), goldens, canon registered, on museum/app shelves, owner playtest approved; merged f01bbcc |

## In flight (agents)
No subagents running. Wave 2026-09-27b is fully merged and pushed (last: Node 24 09bf43c, STATE de0503a); every merged agent worktree is removed. INKLIGHT session closed 2026-09-27 (merged f01bbcc, 33ee30e, tests f4662f9; worktree and branches removed). Website Museum (feat/site-museum from the Windows PC, tip 4a759c2) merged a4115a7 and live as site/2026-09-27.5: home-page den + /museum/ card catalogue; merged-tree verify 1192/1192; its 3 inbox lessons wait for the next curator fold. Open SDK PUBLISHED 2026-09-27: https://github.com/rick-learns/cyclorama-sdk v0.1.0 (one commit fbcca66, noreply author, its CI green) and /sdk/ live on www.playcyclorama.com as site/2026-09-27.6 (f7aab14, CI 36353671084, live check all PASS). Releases: `node tools/export-open.ts <dir>` then one fresh commit per version (docs/PUBLIC_REPO_PLAN.md). 0.1.1 cleanups: tests/machine-speed.test.ts and tests/scrim-hw.test.ts still name first-party titles, and tools/test-tier.ts mentions .claude/worktrees (harmless; titles are public on /museum/).

### Sessions (long-lived)
Total agents now: lead only. (open-sdk closed 2026-09-27: worktree and branch removed.)

### Resuming the lead (after /clear or a restart)
- `node tools/checkout-lock.ts status`: after /clear the same Claude process keeps the integrator claim; a new process takes it over when the old one has exited (else `node tools/checkout-lock.ts claim`).
- Social media: the owner runs it. Site links to YouTube/Instagram/Reddit + hello@ are live (site/2026-09-27.4); new accounts go in site/site.config.json.
- Social images: brand/social/ (avatars, first Instagram post; built by `node brand/social/src/build.ts`, real ERG frames hash-checked) merged 84dc5a1; the owner made the picks outside the repo and all options are kept.
- Owner status 2026-09-27: brand email live and tested (hello@playcyclorama.com, reply not in spam); owner is creating the social accounts — when the handles arrive, add footer links + a contact page + the Bluesky @playcyclorama.com handle (/.well-known/atproto-did) on a site branch, deploy prod, run `npm run deploy -- --check`.
- Owner to do on the Windows PC: install Node 24.21.0, then `npm ci` and `npm run doctor`.

## Queue (after the Next action, in order)
0. DONE (745a690): Checkout lock: twice on 2026-09-26/27 another session switched the shared checkout's branch mid-integration, and a lead merge landed on the wrong branch (4dba17e, c020d1d). Build the audit's proposal: the SessionStart hook records {session, branch} for the shared checkout; tools/agent-guard.ts blocks checkout/switch/rebase there from any other session; the integrator verifies `git merge-base --is-ancestor <merge> origin/main` after every push (tools/deploy-site.ts-style helper). Until then: every non-integrator session works in its own `git worktree add` folder.
0b. DONE (sound-test splash dropped too): Open→closed licence leaks (found by the public-repo planning session; block any public mirror): (i) src/web/debugger/session.ts (OPEN-CODE) imports ../museum-core.ts (OFFICIAL APP) — introduced 2026-09-27 by savestate-v2's DebugSession.loadStored; move the shared load rule into an open module; (ii) roms/sound-test/sound-test.asm (open demo) includes the BRAND Curtain Up (curtainup.inc) — give it the neutral SDK splash. Extend tests/import-boundaries.test.ts to catch both (red first). docs/public-repo-plan (fcbb9ad, not merged: owner decisions pending in docs/PUBLIC_REPO_PLAN.md) lives in /Users/rick/dev/anotherFunGame-public-repo.
1. DONE (9021a04): SPDX header rollout: FileCopyrightText -> rick-learns on every file, headers on the ~85 .ts files without one, plus a header lint (the NOTICE/site/docs holder test is already on main).
2. Self-hosted Mac runner: DONE — the `ghrunner` LaunchDaemon (launchctl asuser) ran green in dispatch 36287069114 on c020d1d; the CI session removes the old ~/actions-runner (backups/ kept).
3. DONE (09bf43c): D-7 Node 24.21.0. D-8 Biome after feat/inklight lands. Windows PC: install Node 24.21.0 (owner).
4. M4: INKLIGHT only (owner, 2026-09-27: no 10-game library). Design approved and merged (3430cf2); the build runs as long session `inklight` (registrar inside it) (skills cyc-new-cartridge, cyc-scrim-game-patterns, cyc-completion-route). No other new title unless the owner asks.
5. DONE (d28782e): tools/budget.ts detects CLI runs with endsWith("budget.ts"); make it match the exact file (cyc-verify rule).
6. Optional: a fast-tier test that catches a WAI/timer fast-forward overshoot (dedup gap 2); flake stage 2 (5-round stress, red/green for the gamepad and frame-advance waits); a committed test pinning pre-v2 saveState == the v1 fixtures (savestate note ii).
2b. DONE (d017d50): Site ops + infrastructure runbook: no platform-engineer skill or custom dashboard for now (owner Q&A 2026-09-27); revisit when a backend, Steam build pipeline, second runner/cloud service or second operator appears.
6b. Brand mockups: the Library section shots were re-shot on the Mac in Helvetica/Times (the Bahnschrift/Sitka stand-ins exist only on Windows). Re-shoot on the Windows PC (`node brand/mockups/src/build.ts section-library`) or move the mockups to the site's self-hosted OFL fonts.
6d. Guard/hook follow-ups from the curator: let agents run the read-only `node tools/deploy-site.ts --check`; SubagentStart contract text names agent-id message files and the `# Lessons from <branch>` inbox header (tools/hooks/subagent-start-context.ts; owner approves hook text). Docs: docs/RESTRUCTURE_PLAN.md step 13 holder, CONTRIBUTING.md 'Running the checks' lacks the SPDX step.
6c. DONE (open-sdk slice 2): debugger-session/views tests retiered OPEN-CODE.
6e. Watch: tests/site.test.ts "home, desktop: scrolling runs the opening cue" failed once under full-suite load (CLS 0.106, limit 0.1, slice 3 merge verify) and passed 3/3 alone; if it recurs, fix the race (skill cyc-verify).
7. DONE: D-11 answered 2026-09-27, no trademark filing needed. (Cloudflare Web Analytics stays ON: allowed by the CSP and disclosed, live as site/2026-09-27.2.)

## Next action
D-8 Biome 2.5.14 lint/format on a build/ branch (the open SDK has landed and been published), then M5 planning (MISSION.md M5). Skills inbox has 9+ unfolded lesson files: spawn a cyc-skills-curator first.
