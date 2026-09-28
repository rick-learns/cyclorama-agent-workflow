# cyclorama-agent-workflow

This is the Claude Code setup I used to build the [Avenell Cyclorama](https://www.playcyclorama.com),
a fictional 1987 games console with a real hardware manual, emulator, assembler, compiler and
games. It contains the skills, agent definitions, hooks and git policies that let about seven
Claude agents work in one repository at once without breaking each other's work or claiming
results they didn't get.

The console's toolchain is public as [cyclorama-sdk](https://github.com/rick-learns/cyclorama-sdk).
The games, the in-universe history and the business plans stay in the private monorepo. The
files in `.claude/`, `tools/` and `tests/` are copied from it. The only code change is the
Windows fix to the guard described below.

Some numbers from the monorepo:
- 501 commits, 120 of them `--no-ff` merges of agent branches.
- 42 background agents launched from one laptop.
- The last merge ran 1,192 tests.
- Four games shipped, and a human playtested and signed off the first three.

## What's here

| Path | Contents |
|---|---|
| [`.claude/skills/`](.claude/skills/) | 13 skills: the procedures agents follow (building a cartridge, verifying, registering canon, reviewing docs) |
| [`.claude/agents/`](.claude/agents/) | 6 agent roles, each with its own tool limits |
| [`.claude/settings.json`](.claude/settings.json) | the hook wiring and the deny rules for secret files |
| [`tools/`](tools/) | the command guard, the checkout lock, the hook scripts and the commit, push and test-integrity checks |
| [`tests/`](tests/) | tests for everything in `tools/` (66, all passing standalone) |
| [`STATE.md`](STATE.md), [`CLAUDE.md`](CLAUDE.md) | the state file the agents read at start-up (a frozen copy) and the project instructions |

## Agents sharing one `.git`

Each subagent works in its own git worktree, but all worktrees share one set of refs, one stash
and one object store. One agent running `git stash pop` or `git push --force` can undo another
agent's work.

[`tools/agent-guard.ts`](tools/agent-guard.ts) runs before every Bash and PowerShell command,
as a Claude Code PreToolUse hook. It blocks force pushes, pushes and ref writes from agent
worktrees, `git reset --hard` on `main`, `--no-verify`, `git clean -x`, bare `git stash`,
`git add -A` from agents, and recursive deletes of the repo or its source folders. The agent
sees the reason and a safe alternative:

```
$ git stash
Blocked by tools/agent-guard.ts: The git stash stack is shared by every session and worktree.
Use a WIP commit, or `git stash push -u -m "<unique-tag>"` then `git stash apply <sha>` (never pop).
```

Claude Code treats a hook that crashes or times out as "no decision" and runs the command. So
the guard is started through [`guard-failsafe.ts`](tools/hooks/guard-failsafe.ts), which allows
a command only when the guard exits 0. If a bad merge leaves a syntax error in `agent-guard.ts`,
every git command is blocked until someone fixes it. Without the wrapper, every git command
would be allowed.

The guard reads the command text, so a command built at runtime (`sh -c "$(…)"`) can get past
it. It stops accidents, not someone deliberately working around it.

## Two sessions in one checkout

Twice, a second Claude session switched the branch of the checkout where the lead was merging,
and a merge landed on the wrong branch. [`tools/checkout-lock.ts`](tools/checkout-lock.ts) now
records which session owns that checkout, in `.git/cyc-checkout-lock.json`. The guard blocks
`checkout`, `switch` and `rebase` there for every other session and prints the
`git worktree add ../<repo>-<name> …` command to use instead.

The claim survives `/clear`, because it follows the Claude process as well as the session id.
When that process exits, the next session to start in the checkout takes the claim.

This repo's first Windows CI run found a gap. GitHub's Windows machines give the temp folder as
a short 8.3 path (`C:\Users\RUNNER~1\…`), while git reports the long one. The guard compared
the two, found no match, and let the branch switch through. It now resolves paths with
`realpathSync.native`, which expands short names.

## Agents reporting success they didn't get

An agent can turn a failing branch green by weakening the tests instead of fixing the code.
[`tools/test-integrity.ts`](tools/test-integrity.ts) runs before every merge. It compares an
agent branch with the point where it left `main`:

```
$ node tools/test-integrity.ts main worktree-agent-a1b2
FAIL (2):
- tests/math.test.ts: adds a skip/only/todo: test.skip("subtracts", () => { assert.equal(2 - 1, 1); });
- assertions dropped 3→2 across changed test files: tests/math.test.ts (tests 2→2, asserts 3→2)
A deliberate change needs a DECISIONS.md line on the branch naming the file.
```

It also fails when a test file is deleted, when an expected hash changes without a matching
source change, or when the test command gains a filter.

Two other checks cover claims that test counts can't:
- **An independent verifier.** The
  [acceptance verifier](.claude/agents/cyc-acceptance-verifier.md) has no Edit or Write tools. It
  merges the finished branch into a fresh worktree, re-runs each claim in the builder's report
  and tries to disprove it.
- **A `Verified:` line on every feat, fix, perf and canon commit.** It states what was actually
  observed, and [`tools/commit-msg.ts`](tools/commit-msg.ts) rejects the commit without it. A
  real one:

```
fix(asm): create the output folder in the asm and scrim CLIs

On a fresh clone `npm run asm -- … -o build/x.rom` (the Lantern Test README's
command) crashed with ENOENT because build/ did not exist; […] Both CLIs now
create the folder of every file they write (outsider review B3).

Verified: asm-cli and scrim-cli tests 10/10; the two new folder tests red before
```

Documentation got a different check. The
[outsider reviewer](.claude/agents/cyc-outsider-reviewer.md) runs without the project
instructions and sees only the document under review, such as the hardware manual or the SDK
guide. It lists every place a newcomer would get stuck. After the fixes, a second new reviewer gets
the document and the issue list. It marks an issue resolved only when the document now pins the
behaviour down, so that two people implementing from it would get the same bytes and cycle
counts.

## Keeping the lead oriented

The lead session runs for hours, and compaction drops details. On every start, resume, `/clear`
and compaction, [`session-start-state.ts`](tools/hooks/session-start-state.ts) puts a short
block into the lead's context. It lists the milestone, open owner decisions, agents in flight,
unmerged agent branches and the single next action from [`STATE.md`](STATE.md). A trimmed real
one:

```
[cyc] Checkout lock: this session (d0bf0f56) is the integrator of …/anotherFunGame (branch main).
Milestone: M5 — Archaeology + canon validator (M4 PASSED 2026-09-27)
Decisions for the owner (2; ask at most 3 per wave summary):
- [D-13] (licensing) Relicense examples/ … under Apache-2.0 WITH LLVM-exception …
Next action: D-8 Biome 2.5.14 lint/format on a build/ branch, then M5 planning.
Unmerged agent branches: none
Skills inbox: 11 unfolded lesson file(s)
```

Subagents get the same kind of help at both ends:
- **At start**, [`subagent-start-context.ts`](tools/hooks/subagent-start-context.ts) injects
  `main`'s current commit and the standing rules. That keeps each task brief to 20–40 lines.
- **At finish**, [`subagent-stop-inbox.ts`](tools/hooks/subagent-stop-inbox.ts) holds an agent
  that tries to stop with uncommitted work or without its lesson file, and tells it what's
  missing. It does this at most once in a row, and it lets the agent go if it can't work out the
  agent's branch.

## Skills that get corrected by use

An agent that learns something while building writes it down as one tagged line on its own
branch:

```
- [cyc-verify] A docs page that shows code must be built from the same files the tests run:
  sample markers + doc-check caught every excerpt that went stale during the review fixes
  — evidence: docs/guide/testing.md sample of tests/example-tutorial-1.test.ts — scope: always
```

After each round of merges, a fresh [curator](.claude/agents/cyc-skills-curator.md) moves the
general lessons into the named skill and deletes the inbox file. It drops lessons that applied
only to one task. [`tools/skills-lint.ts`](tools/skills-lint.ts) then checks every skill for
frontmatter, a "Use when…" trigger, a 150-line limit and links that resolve.

A lesson can only add or correct procedure. The curator never turns one into a new URL to fetch,
a tool permission, a hook or a relaxed check. Agents read web pages, and this rule stops text
from one of those pages from ending up in project policy.

## Where people make the decisions

The monorepo's mission file, which isn't included here, defines milestones with acceptance
criteria and the conditions under which agents must stop. The hardest stop comes after three games are accepted: the lead
writes `PLAYTEST_REQUEST.md` and halts until a person has played them and added
`PLAYTEST_APPROVED.md`.

Decisions only the owner can make go into `STATE.md` as one line each, with a recommended
default and a note on what work continues in the meantime. Each round of merges raises at most
three of them. Every decision goes into an append-only `DECISIONS.md`. A later entry replaces an
earlier one, and nothing is edited in place.
[The process entries](docs/examples/DECISIONS-process.md) show the setup changing over two days.

## Tools

- **Claude Code** runs every agent. The setup uses its worktree isolation, subagents defined in
  `.claude/agents/`, skills, hooks, and `SendMessage` between sessions.
- **[herdr](https://herdr.dev)** holds the long sessions. Each one runs in its own herdr tab, in
  its own sibling worktree. I steered the Mac from a Windows PC with `herdr --remote`. The
  sidebar shows whether each session is working, blocked on a question, or done.
  `herdr agent prompt <name> "…"` sends a session a note without going through the lead. herdr
  only sees top-level sessions, though. The subagents a session starts don't appear in it and
  aren't restored after a restart. So the lead keeps them in STATE.md "In flight" and relaunches
  them from that list.
- **GitHub Actions** runs the full gate on Ubuntu for every push to `main`, and adds Windows for
  pull requests. A self-hosted runner on the laptop, running as a separate non-admin user, adds
  macOS for manual runs of `main` only. Every third-party action is pinned to a commit SHA, and
  Dependabot keeps the pins current.
- **Playwright** with Chromium runs the browser tests and takes the screenshots shown to a
  person, always from real ROMs running in the emulator.
- **Cloudflare Workers** serves playcyclorama.com through `wrangler`. A deploy to production is
  refused unless the commit is on `main` and has a green CI run.
- **esbuild** bundles the web player, museum, debugger and app. **Blender** renders the product
  photos of the console, controller and cartridges on the website.
- **Node 24** runs the TypeScript directly, with no build step.

## Running it

Node 24 runs the TypeScript directly, so there is no build step:

```sh
npm ci
npm test              # 66 tests
npm run typecheck
npm run skills:lint
```

CI runs the same commands on GitHub-hosted Ubuntu and Windows machines, and on macOS once the
repository is public (a private repository pays 10x for macOS minutes).

## Limits of this copy

The skills and agent roles refer to the emulator, the games, the canon files and other parts of
the monorepo that aren't here. Those references are left in, so the text shows how the agents
really worked. The hooks in `.claude/settings.json` do work here. The git hooks in `.githooks/`
also call monorepo checks (the canon validator), so enabling them in this repo will fail.

## Licence

- Code (`tools/`, `tests/`, `.githooks/`, `.github/`): [Apache-2.0](LICENSES/Apache-2.0.txt).
- Skills, agent roles and docs: [CC BY 4.0](LICENSES/CC-BY-4.0.txt).
- `.claude/skills/cyc-show-human/shoot.ts` keeps its all-rights-reserved header.
- Neither licence covers the names Avenell and Cyclorama, the game titles or the Curtain Up
  splash.
