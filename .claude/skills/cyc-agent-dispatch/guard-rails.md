# Guard rails in detail (for [SKILL.md](SKILL.md) "Guard rails")

## Harness isolation
Hit by 7 agents in one wave. A worktree agent's command is refused as "too complex to verify"
when the harness can't prove it stays inside the worktree. Refused: shell loops, `$(...)`,
heredocs, `git -C`, `cd … &&` chains, redirections on paths, `sed -i` on a path in a variable,
`node -e` / python / bash scripts whose text mentions git, piping JSON that mentions git into
node, and any of these on a path containing "git" (`.githooks`, `GitHub`: on the Windows PC that
includes the session scratchpad, `…-Documents-GitHub-…`). The Write tool also refuses the main
checkout's copy of a worktree path.

Instead:
- one plain command per call with literal worktree paths;
- files via Write/Edit (or one PowerShell command);
- commit messages via a file and `git commit -F <file>`, the file named for your agent id
  (`<id>-msg1.txt`): every agent of a session shares one scratchpad, and a generic `msg1.txt`
  was overwritten by another branch's message between Write and commit (aefb736, a6006ce);
- a small `.mjs` driver in the scratchpad that spawns a script with `input:` when stdin is needed;
- a hook script as `sh .githooks/<hook> <args>`, not `./.githooks/<hook>` (until the guard changes).

The SubagentStart contract carries the one-plain-command rule.

## Agent guard
`tools/agent-guard.ts` (PreToolUse, installed; tests `tests/agent-guard.test.ts`) blocks:
- from worktrees: `git push`, writes to the main ref; from agents: `git add -A/--all/./:/`,
  deploys (`npm run deploy`, `wrangler`, any command naming `tools/deploy-site.ts`, even the
  read-only `--check`) and the Cloudflare token. Never brief an agent for real `--check` output:
  the lead runs it (a8ca51e) (until the guard allows `--check`);
- in the shared checkout: `git checkout <x>`, `git switch`, `git rebase` for every session but
  the checkout-lock holder, and always for subagents (see "Checkout lock" below);
- the lead shell `cd`/`Set-Location` into `.claude/worktrees/*`;
- anywhere: force pushes, `reset --hard` on main, `--no-verify` / `commit -n` /
  `-c core.hooksPath=…`, `git clean -x/-X`, bare `git stash` / `stash pop`;
- recursive deletes of the repo, its source dirs, `.git`, `.claude` or `.claude/worktrees/*`.

It runs through `tools/hooks/guard-failsafe.ts`: a guard that crashes or hangs **blocks** with a
"fail-safe" message. Fix the guard (`node --test tests/agent-guard.test.ts`); never route around
a block. The lead's commit, `merge --no-ff`, push, `worktree remove`, `branch -d` and npm/node
commands stay allowed.

## Checkout lock
The integrator's shared checkout (the main working tree) is locked to one session, recorded in
`.git/cyc-checkout-lock.json` (`tools/checkout-lock.ts`; tests `tests/checkout-lock.test.ts`,
`tests/agent-guard.test.ts`). Two lead merges landed on a side branch after another session
switched it (4dba17e, c020d1d).
- Only the holder may `git checkout <x>`, `git switch` or `git rebase` there; subagents never
  can. `git checkout -- <path>` stays allowed.
- The SessionStart hook claims the checkout for the first session that starts there while no
  claim is live. A `/clear` in the same Claude process moves the claim; an exited holder is
  taken over, and one not seen for 24 h is taken over with a WARNING.
- `node tools/checkout-lock.ts status|claim|release` manage it. `claim --force` and
  `release --force` are the owner's call only.
- **Blocked?** Run `git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main` and
  work there. Never force the claim to get past the block.
- Integrator refused after a restart (new process, no `/clear`): re-claim with
  `node tools/checkout-lock.ts claim`, which reads `CLAUDE_CODE_SESSION_ID` and `CLAUDE_PID` from
  the Bash tool's env (Claude Code 2.1.283) (until the harness changes these variables).
- After every push of main: `node tools/checkout-lock.ts pushed <merge-sha>` (default HEAD). It
  fetches, exits 0 only if the commit is on origin/main, and warns when the shared checkout is
  not on main. A merge has landed only on exit 0.
