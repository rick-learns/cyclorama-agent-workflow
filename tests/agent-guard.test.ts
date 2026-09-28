// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// The Claude Code PreToolUse guard (tools/agent-guard.ts, wired in .claude/settings.json) must block
// the handful of commands that can destroy work in an agent-heavy repo, and must NOT block the
// lead's normal work (commit on main, merge, push) or an agent's normal work (commit on its branch).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCommand, type GuardContext } from "../tools/agent-guard.ts";

const MAIN = "/repo";
const WT = "/repo/.claude/worktrees/agent-1";
const branches: Record<string, string> = { [MAIN]: "main", [WT]: "worktree-agent-1" };
const rootsOf = (dir: string) => (dir.startsWith(WT) ? [WT, MAIN] : [MAIN]);
const ctx = (cwd: string, shell: "bash" | "powershell" = "bash"): GuardContext => ({
  cwd, shell,
  branchOf: dir => branches[dir] ?? null,
  rootsOf,
  topLevelDirs: () => ["src", "tests", "tools", "roms", "canon", "docs", ".git", ".claude", ".tmp", "build", "node_modules"],
});
const blocked = (cmd: string, c: GuardContext) => assert.ok(checkCommand(cmd, c), `expected block: ${cmd}`);
const allowed = (cmd: string, c: GuardContext) => assert.equal(checkCommand(cmd, c), null, `expected allow: ${cmd}`);

test("lead's normal work is allowed", () => {
  for (const cmd of [
    "git status", "git add src/a.ts && git commit -m \"M4: thing\"", "git merge --no-ff worktree-agent-1",
    "git push", "git push origin main", "git push --follow-tags origin main", "git push -u origin main",
    "git reset --soft HEAD~1", "git clean -fd .tmp", "git stash list", "git stash push -u -m \"lead-wip-1\"",
    "git stash apply 1234abcd", "rm -rf .tmp/browser build", "rm -rf node_modules/.cache", "npm run verify",
    "git commit -m \"fix -n flag parsing\"", "git log --oneline -5 | head", "git branch -d worktree-agent-1",
    "git worktree list", "rm -f README.tmp", "git commit -m \"-n is fine inside a message\"",
  ]) allowed(cmd, ctx(MAIN));
});

test("an agent's normal work in its worktree is allowed", () => {
  for (const cmd of [
    "git add tools/x.ts && git commit -m \"agent work\"", "git reset --hard HEAD~1", "git status",
    "rm -rf .tmp", "git rebase main", "git diff main...HEAD", "git branch -f scratch HEAD",
  ]) allowed(cmd, ctx(WT));
});

test("force pushes are blocked everywhere", () => {
  for (const cmd of [
    "git push --force", "git push -f origin main", "git push origin main --force-with-lease",
    "git push --force-with-lease=main:abc origin main", "git push origin +main", "git push -fu origin x",
    "git push --mirror", "cd /repo && git push --force", "FOO=1 git push -f", "git -C /repo push --force",
    "git push --delete origin main", "git push origin :main",
  ]) blocked(cmd, ctx(MAIN));
  blocked("git push --force", ctx(MAIN, "powershell"));
});

test("pushes and main-ref writes from a worktree agent are blocked", () => {
  for (const cmd of [
    "git push", "git push origin worktree-agent-1", "git push . HEAD:main", "git update-ref refs/heads/main HEAD",
    "git branch -f main HEAD", "git branch -D main", "git fetch . HEAD:main", "git fetch . HEAD:refs/heads/main",
  ]) blocked(cmd, ctx(WT));
});

test("git reset --hard on main is blocked (in main checkout or via -C / cd)", () => {
  blocked("git reset --hard", ctx(MAIN));
  blocked("git reset --hard origin/main", ctx(MAIN));
  blocked("git -C /repo reset --hard HEAD", ctx(WT));
  blocked("cd /repo && git reset --hard", ctx(WT));
  blocked("git reset --hard HEAD~1", ctx(MAIN, "powershell"));
});

test("hook bypasses are blocked", () => {
  for (const cmd of [
    "git commit --no-verify -m x", "git commit -n -m x", "git commit -anm x", "git push --no-verify",
    "git merge --no-verify topic", "git -c core.hooksPath=/dev/null commit -m x",
  ]) blocked(cmd, ctx(MAIN));
});

test("git clean that removes ignored files (node_modules, worktrees' deps) is blocked", () => {
  for (const cmd of ["git clean -fdx", "git clean -xfd", "git clean -fX", "git clean -f -d -x"]) blocked(cmd, ctx(MAIN));
});

test("bare stash and stash pop are blocked (the stash stack is shared by all sessions)", () => {
  for (const cmd of ["git stash", "git stash pop", "git stash -u", "git stash push", "git stash push -u"]) blocked(cmd, ctx(MAIN));
});

test("recursive deletes of the repo, its source dirs, .git or the worktrees are blocked", () => {
  for (const cmd of [
    "rm -rf .", "rm -rf ./", "rm -rf *", "rm -rf src", "rm -fr tests/", "rm -r --force .git", "rm -rf .claude/worktrees",
    "rm -rf .claude/worktrees/agent-2", "rm -rf /repo", "rm -rf ..", "rm -rf ~", "rm -rf /", "rm -Rf canon",
    "cd /repo && rm -rf docs", "sudo rm -rf /repo/roms",
  ]) blocked(cmd, ctx(MAIN));
  blocked("rm -rf ../../..", ctx(WT)); // the main checkout, from inside a worktree
  blocked("rm -rf src", ctx(WT));
  for (const cmd of ["Remove-Item -Recurse -Force src", "rm -r -fo .claude/worktrees", "Remove-Item -Path . -Recurse", "ri -rec tools"]) {
    blocked(cmd, ctx(MAIN, "powershell"));
  }
  allowed("Remove-Item -Recurse -Force .tmp/browser", ctx(MAIN, "powershell"));
  allowed("Remove-Item -Force src/old.ts", ctx(MAIN, "powershell"));
  allowed("rm src/old.ts", ctx(MAIN));
  allowed("rm -rf \"$TMPDIR/scratch\"", ctx(MAIN));
});

test("windows-style paths are normalised", () => {
  const w: GuardContext = {
    cwd: "C:\\repo", shell: "powershell",
    branchOf: d => (d.toLowerCase() === "c:/repo" ? "main" : null),
    rootsOf: () => ["C:/repo"],
    topLevelDirs: () => ["src", ".tmp"],
  };
  assert.ok(checkCommand("Remove-Item -Recurse C:\\repo\\src", w));
  assert.ok(checkCommand("rm -rf /c/repo/src", { ...w, shell: "bash" }));
  assert.equal(checkCommand("Remove-Item -Recurse C:\\repo\\.tmp", w), null);
  assert.ok(checkCommand("git reset --hard", w));
});

test("agents never stage everything (git add -A / --all / . / :/), but may stage paths", () => {
  const agentMain = { ...ctx(MAIN), isSubagent: true };
  for (const c of [ctx(WT), agentMain]) {
    for (const cmd of ["git add -A", "git add --all", "git add .", "git add ./", "git add :/", "git add -A tools", "git add -vA", "git add *", "git add tools/x.ts && git add ."]) blocked(cmd, c);
    for (const cmd of ["git add tools/x.ts tests/x.test.ts", "git add .claude/skills/_inbox/worktree-agent-1.md", "git add -p tools/x.ts", "git add roms/foo/.gitkeep"]) allowed(cmd, c);
  }
  blocked("git add -A", ctx(WT, "powershell"));
  // The lead stages specific paths by rule (cyc-iteration §4), but the guard only enforces it for agents.
  allowed("git add -A", ctx(MAIN));
});

test("the lead shell never cds into an agent worktree; agents and git -C are unaffected", () => {
  for (const cmd of ["cd .claude/worktrees/agent-2", "cd /repo/.claude/worktrees/agent-2/tools", "cd .claude/worktrees/agent-2 && git status", "pushd .claude/worktrees/agent-2"]) blocked(cmd, ctx(MAIN));
  for (const cmd of ["Set-Location .claude\\worktrees\\agent-2", "Set-Location -Path .claude/worktrees/agent-2", "sl .claude/worktrees/agent-2"]) blocked(cmd, ctx(MAIN, "powershell"));
  // A lead session that itself runs in a worktree may move around inside it, but not into another one.
  allowed("cd tools", ctx(WT));
  allowed(`cd ${WT}/tools`, ctx(WT));
  blocked("cd ../agent-2", ctx(WT));
  // Subagents (hook input carries agent_id) are isolated by the harness and may cd in their own worktree.
  allowed(`cd ${WT} && git status`, { ...ctx(WT), isSubagent: true });
  allowed("git -C .claude/worktrees/agent-2 status", ctx(MAIN));
  allowed("git log --oneline main..worktree-agent-2", ctx(MAIN));
  allowed("cd .claude/worktrees", ctx(MAIN));
  allowed("cd tools && cd ..", ctx(MAIN));
});

test("Claude Code settings are installed and wire every guard hook through the fail-safe wrapper to tools/agent-guard.ts", () => {
  const s = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
  const handlers = s.hooks.PreToolUse.flatMap((m: { hooks: { args: string[] }[] }) => m.hooks);
  assert.ok(handlers.length >= 6);
  for (const h of handlers) {
    assert.ok(h.args.some((a: string) => a.endsWith("/tools/hooks/guard-failsafe.ts")), JSON.stringify(h));
    assert.ok(h.args.some((a: string) => a.endsWith("/tools/agent-guard.ts")), JSON.stringify(h));
  }
  assert.ok(existsSync("tools/agent-guard.ts") && existsSync("tools/hooks/guard-failsafe.ts"));
  const ifs = handlers.map((h: { if?: string }) => h.if);
  for (const rule of ["Bash(git *)", "Bash(rm *)", "Bash(cd *)", "PowerShell(git *)", "PowerShell(Remove-Item *)", "PowerShell(Set-Location *)"]) assert.ok(ifs.includes(rule), rule);
  assert.ok(s.permissions.deny.includes("Bash(git push --force*)"));
});

const guardInput = (command: string, extra: object = {}) => JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: process.cwd(), ...extra });

test("hook entry point: exit 2 with a reason on block, exit 0 on allow, and fail-safe (exit 2) on input it cannot read", () => {
  const run = (input: string) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "tools/agent-guard.ts"], { input, encoding: "utf8" });
  const deny = run(guardInput("git push --force"));
  assert.equal(deny.status, 2);
  assert.match(deny.stderr, /force/i);
  assert.equal(run(guardInput("git status")).status, 0);
  const bad = run("not json");
  assert.equal(bad.status, 2, "a guard that cannot read its input must block, not allow");
  assert.match(bad.stderr, /fail-safe/);
  assert.equal(run(JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } })).status, 0);
  // agent_id in the hook input marks a subagent: `git add -A` is blocked for it even outside a worktree.
  assert.equal(run(guardInput("git add -A", { agent_id: "a1" })).status, 2);
});

test("fail-safe wrapper: passes the guard's verdict through, and blocks when the guard crashes, hangs or cannot load", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-"));
  const script = (name: string, src: string) => { const p = join(dir, name); writeFileSync(p, src); return p; };
  const wrap = (guard: string, input: string, extra: string[] = []) =>
    spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "tools/hooks/guard-failsafe.ts", guard, ...extra], { input, encoding: "utf8" });
  try {
    assert.equal(wrap("tools/agent-guard.ts", guardInput("git status")).status, 0);
    const deny = wrap("tools/agent-guard.ts", guardInput("git push --force"));
    assert.equal(deny.status, 2);
    assert.match(deny.stderr, /force/i);
    for (const [name, src] of [
      ["throws.ts", "throw new Error('boom');"],
      ["exit1.ts", "process.exitCode = 1;"],
      ["syntax.ts", "const = ;"],
      ["abort.ts", "process.abort();"],
    ]) {
      const r = wrap(script(name, src), guardInput("git status"));
      assert.equal(r.status, 2, `${name} must be blocked, got ${r.status}`);
      assert.match(r.stderr, /fail-safe/, name);
    }
    const hang = wrap(script("hang.ts", "setInterval(() => {}, 1000);"), guardInput("git status"), ["--timeout-ms=400"]);
    assert.equal(hang.status, 2);
    assert.equal(wrap(join(dir, "missing.ts"), guardInput("git status")).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- checkout lock: only the recorded integrator moves the shared checkout's branch --------------

const SHARED = "/Users/rick/dev/anotherFunGame";
const SHARED_WT = `${SHARED}/.claude/worktrees/agent-7`;
const OTHER_WT = "/Users/rick/dev/anotherFunGame-planning";
const INTEGRATOR = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";
const holder = { session: INTEGRATOR, pid: 4242, branch: "main", checkout: SHARED, claimedAt: "2026-09-27T08:00:00.000Z", seenAt: "2026-09-27T08:00:00.000Z" };
const lockCtx = (cwd: string, sessionId: string | undefined, extra: Partial<GuardContext> = {}): GuardContext => ({
  cwd, shell: "bash", sessionId,
  branchOf: () => "main",
  rootsOf: dir => (dir.startsWith(SHARED_WT) ? [SHARED_WT, SHARED] : dir.startsWith(OTHER_WT) ? [OTHER_WT] : [SHARED]),
  topLevelDirs: () => ["src", "tools"],
  sharedCheckoutOf: dir => (dir === SHARED || (dir.startsWith(SHARED + "/") && !dir.startsWith(`${SHARED}/.claude/worktrees/`)) ? SHARED : null),
  integratorOf: root => (root === SHARED ? holder : null),
  ...extra,
});
const MOVERS = ["git checkout feat/x", "git switch feat/x", "git rebase main", "git rebase --continue", "git checkout -b feat/y", "git switch -c feat/y", "git checkout -", "git switch --detach HEAD~1", "git checkout origin/main"];

test("checkout lock: other sessions cannot checkout/switch/rebase in the shared checkout, and are told to use a worktree", () => {
  for (const cmd of MOVERS) {
    const why = checkCommand(cmd, lockCtx(SHARED, OTHER));
    assert.ok(why, `expected block: ${cmd}`);
    assert.ok(why.includes("git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main"), why);
    assert.match(why, /99999999|integrator session 11111111/);
  }
  // Through -C, cd, a subdirectory, env wrappers and PowerShell too.
  for (const [cmd, cwd] of [
    [`git -C ${SHARED} switch feat/x`, OTHER_WT], [`cd ${SHARED} && git checkout feat/x`, OTHER_WT], ["git checkout feat/x", `${SHARED}/tools`],
    ["FOO=1 git -c color.ui=never switch feat/x", SHARED], [`cd ../.. && git switch feat/x`, SHARED_WT],
  ]) blocked(cmd, lockCtx(cwd, OTHER));
  blocked("git switch feat/x", { ...lockCtx(SHARED, OTHER), shell: "powershell" });
  // No session id, no recorded claim, or a claim that cannot be read: nobody is the integrator (fail closed).
  blocked("git switch feat/x", lockCtx(SHARED, undefined));
  const unclaimed = checkCommand("git switch feat/x", lockCtx(SHARED, INTEGRATOR, { integratorOf: () => null }));
  assert.ok(unclaimed && unclaimed.includes("node tools/checkout-lock.ts claim"), String(unclaimed));
  // A subagent of the integrator session carries the integrator's session id but is not the integrator.
  blocked("git checkout feat/x", { ...lockCtx(SHARED, INTEGRATOR), isSubagent: true });
});

test("checkout lock: the integrator, other worktrees and path restores are unaffected", () => {
  for (const cmd of MOVERS) allowed(cmd, lockCtx(SHARED, INTEGRATOR));
  for (const cmd of MOVERS) {
    allowed(cmd, lockCtx(SHARED_WT, OTHER));
    allowed(cmd, lockCtx(OTHER_WT, OTHER));
    allowed(cmd, { ...lockCtx(SHARED_WT, INTEGRATOR), isSubagent: true });
  }
  for (const cmd of [
    "git checkout -- src/a.ts", "git checkout HEAD -- src/a.ts tools/b.ts", "git checkout main -- .", "git checkout -p src/a.ts",
    "git checkout", "git status", "git restore src/a.ts", "git worktree add ../anotherFunGame-plan -b docs/plan origin/main",
    "git merge --no-ff feat/x", "git log --oneline -3 main", "git branch -d feat/x", "git rebase-helper",
  ]) allowed(cmd, lockCtx(SHARED, OTHER));
  // Without the lock hooks in the context (older callers), the rule is inactive.
  allowed("git switch feat/x", ctx(MAIN));
});

test("checkout lock through the hook entry point: the recorded integrator passes, another session is blocked, a corrupt lock blocks", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-lock-"));
  const g = (...a: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd: dir, encoding: "utf8" });
  try {
    g("init", "-q", "-b", "main");
    writeFileSync(join(dir, "a.txt"), "a");
    g("add", "a.txt");
    g("commit", "-q", "-m", "init");
    const lock = join(dir, ".git", "cyc-checkout-lock.json");
    writeFileSync(lock, JSON.stringify({ version: 1, holder: { ...holder, checkout: dir, pid: null }, recent: [] }));
    const run = (session_id: string, command: string, cwd = dir) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(process.cwd(), "tools/agent-guard.ts")], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd, session_id }), encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_CODE_SESSION_ID: "" },
    });
    assert.equal(run(INTEGRATOR, "git switch -c feat/x").status, 0);
    const deny = run(OTHER, "git switch -c feat/x");
    assert.equal(deny.status, 2);
    assert.match(deny.stderr, /git worktree add \.\.\/guard-lock-\w+-<name> -b <type>\/<topic> origin\/main/);
    assert.equal(run(OTHER, "git checkout -- a.txt").status, 0);
    writeFileSync(lock, "{ not json");
    assert.equal(run(INTEGRATOR, "git switch main").status, 2, "a lock that cannot be read names no integrator: block");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("subagents can neither deploy the website nor read the Cloudflare token or the mailbox login; the lead can deploy", () => {
  const agent = { ...ctx(WT), isSubagent: true };
  const agentInMain = { ...ctx(MAIN), isSubagent: true };
  for (const c of [agent, agentInMain]) for (const cmd of [
    "npm run deploy", "npm run deploy -- --prod", "npm run-script deploy", "node tools/deploy-site.ts --prod",
    "node --disable-warning=ExperimentalWarning /repo/tools/deploy-site.ts", "npx wrangler deploy", "npx -y wrangler@4.141.0 whoami",
    "tools/deploy/node_modules/.bin/wrangler deploy --config site/wrangler.jsonc", "wrangler rollback",
    "cat ~/.config/playcyclorama.env", "source $HOME/.config/playcyclorama.env && echo ok", ". ~/.config/playcyclorama.env",
    "grep TOKEN /Users/rick/.config/playcyclorama.env", "env | grep CLOUDFLARE_API_TOKEN",
    "cat ~/.config/playcyclorama-mail.env", ". $HOME/.config/playcyclorama-mail.env", "env | grep PROTON_BRIDGE_PASS",
  ]) blocked(cmd, c);
  for (const cmd of ["npm run site", "npm run verify", "node --test tests/deploy-site.test.ts", "cat site/wrangler.jsonc", "grep -n deploy site/README.md"])
    allowed(cmd, agent);
  for (const cmd of ["npm run deploy", "npm run deploy -- --prod", "tools/deploy/node_modules/.bin/wrangler rollback --config site/wrangler.jsonc"])
    allowed(cmd, ctx(MAIN));
});
