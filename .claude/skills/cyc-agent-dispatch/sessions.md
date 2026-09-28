# Long herdr sessions (owner decision 2026-09-27, docs/process/WORKFLOW_REVIEW.md)

A long session is a top-level Claude Code session in its own herdr tab and its own sibling
worktree. It owns open-ended, owner-steered or standing work (a game from design to playtest, an
infra or flake hunt). Bounded jobs stay subagents; the lead stays the only integrator.

## Limits
- At most 2 long sessions besides the lead; about 7 Claude agents in total (sessions plus every
  session's subagents); each session runs at most 2 subagents; heavy tests via `tools/slot.ts`.
- The lead lists sessions in STATE.md "Sessions (long-lived)" and counts agents from it.
- herdr lists and restores only top-level sessions: its hook ignores events carrying `agent_id`,
  so subagents never show in its sidebar and are not brought back by `claude --resume`. Count and
  relaunch them from STATE "In flight (agents)" and ListAgents (`herdr agent list` showed 2 while
  7 ran, wave 2026-09-27b) (until herdr reports subagents).

## Start (lead or owner)
1. `git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main`, then `npm ci` there
   (sibling folders do not see the shared checkout's node_modules).
2. herdr: a tab named `<name>` in workspace `cyc`, cwd the new folder; start `claude` there.
3. First prompt = the charter: the brief template (brief-template.md) plus scope, what needs the
   owner, the rule "never edit main's STATE.md/DECISIONS.md, never push main, never deploy prod",
   and the handoff file below. Version it: `CHARTER v1 — <name> — main at <sha>`.
4. The session commits the charter on its branch as `docs/process/sessions/<name>.md` with a
   `## Handoff` section (next action, evidence paths, open owner questions). It keeps Handoff
   current: it is the recovery path after compaction, `/clear`, `claude --resume` or a dead server.

## Coordination
- Session → lead: SendMessage `READY <branch> <sha> — evidence: <path>` after merging main and
  running test-integrity, `commit-msg --range origin/main..HEAD` and verify. Deliver slices (a game:
  design → playable → recorded → done), one READY per slice.
- Sessions in different permission modes (e.g. bypass vs auto) get each other's SendMessage held
  for the owner's approval (2026-09-27, the owner denied a held copy). Then the lead types notes
  into the session with `herdr agent prompt <name> "…"`, and the session records READY in its
  Handoff and pushes its branch, which the lead watches.
- Lead → session: `main moved (<sha>): <files>. Merge main now.` The lead spawns the
  `cyc-acceptance-verifier` (a builder never picks its own) and merges `--no-ff`, then runs
  `node tools/checkout-lock.ts pushed <merge>` after the push.
- In a sibling folder the SessionStart summary is that branch's STATE.md, not main's (read
  `git show origin/main:STATE.md`), and the agent ledger (`agent-ledger.ts --since`) sees only
  that folder's `.tmp/` (tools/hooks/session-start-state.ts, agent-ledger.ts) (until
  docs/process/WORKFLOW_REVIEW.md items 6-7 land).
- Owner → session: types in its tab. Owner questions go in Handoff; the lead copies them to STATE
  "Decisions for the owner" (at most 3 per wave summary).
- A session may deploy a preview from its branch (`npm run deploy`) when the owner wants to see it.
- The session writes its lessons to `.claude/skills/_inbox/<branch>.md` like any agent.

## Ending
The last slice merged: the session sets Handoff to "done", the lead removes the STATE line, then
`git worktree remove ../anotherFunGame-<name>` and `git branch -d <branch>`.
