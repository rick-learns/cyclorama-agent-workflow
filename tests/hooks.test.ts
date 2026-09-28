// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Claude Code hooks (.claude/settings.json → tools/hooks/*.ts): the settings parse and point at
// scripts that exist; each hook script behaves as documented when fed the hook's stdin JSON; the
// blocking hooks fail safe; the context hooks never block; and no hook script uses the Windows
// crash pattern (readFileSync(0) + process.exit()). The command guard itself is in agent-guard.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const HOOKS = join(ROOT, "tools", "hooks");

type Out = { status: number | null; stdout: string; stderr: string; json: any };
function run(script: string, input: object | string, env: Record<string, string> = {}, args: string[] = []): Out {
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(HOOKS, script), ...args], {
    input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env }, cwd: ROOT,
  });
  const t = (r.stdout ?? "").trim();
  let json: any = null;
  if (t.startsWith("{") && t.endsWith("}")) json = JSON.parse(t);
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", json };
}
const base = { session_id: "s", transcript_path: "t", cwd: ROOT, permission_mode: "default" };

function gitRepo(): { dir: string; git: (...a: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), "cyc-hooks-"));
  const git = (...a: string[]) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "STATE.md"), "# STATE\n");
  git("add", "STATE.md");
  git("commit", "-q", "-m", "init");
  return { dir, git };
}

// ---- settings self-check ---------------------------------------------------------------------

const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
type Handler = { type: string; command: string; args?: string[]; timeout?: number; async?: boolean; if?: string };
const allHandlers = (): [string, Handler][] =>
  Object.entries(settings.hooks as Record<string, { hooks: Handler[] }[]>).flatMap(([ev, groups]) => groups.flatMap(g => g.hooks.map(h => [ev, h] as [string, Handler])));

test("settings.json parses, sets worktree.baseRef=head, and every hook runs node on a script that exists", () => {
  assert.equal(settings.worktree?.baseRef, "head");
  assert.equal(settings.env?.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS, "10");
  const handlers = allHandlers();
  assert.ok(handlers.length >= 10);
  for (const [ev, h] of handlers) {
    assert.equal(h.type, "command");
    assert.equal(h.command, "node", "exec form with node (a .cmd shim cannot be spawned on Windows)");
    const paths = (h.args ?? []).filter(a => a.includes("${CLAUDE_PROJECT_DIR}"));
    assert.ok(paths.length >= 1, `${ev}: no project script`);
    for (const p of paths) {
      assert.match(p, /^\$\{CLAUDE_PROJECT_DIR\}\/[\w./-]+\.ts$/);
      assert.ok(existsSync(join(ROOT, p.replace("${CLAUDE_PROJECT_DIR}/", ""))), `${ev}: missing ${p}`);
    }
    assert.ok(typeof h.timeout === "number" && h.timeout <= 20, `${ev}: bounded timeout`);
  }
  const ss = settings.hooks.SessionStart[0].matcher.split("|");
  for (const m of ["startup", "resume", "clear", "compact"]) assert.ok(ss.includes(m), m);
  for (const ev of ["SubagentStart", "SubagentStop", "PreToolUse", "PostToolUse"]) assert.ok(settings.hooks[ev], ev);
});

test("agent definitions: frontmatter parses, names match files, hook script paths exist, read-only roles cannot edit", () => {
  const dir = join(ROOT, ".claude", "agents");
  const files = readdirSync(dir).filter(f => f.endsWith(".md"));
  assert.ok(files.length >= 4);
  const ALLOWED = new Set(["name", "description", "tools", "disallowedTools", "model", "permissionMode", "mcpServers", "hooks", "maxTurns", "skills", "initialPrompt", "memory", "effort", "background", "omitClaudeMd", "isolation", "color", "experimental"]);
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1];
    assert.ok(fm, `${f}: frontmatter`);
    for (const key of fm.split(/\r?\n/).filter(l => /^[A-Za-z]/.test(l)).map(l => l.split(":")[0])) assert.ok(ALLOWED.has(key), `${f}: unknown frontmatter field ${key} is silently ignored`);
    assert.equal(/^name: (.+)$/m.exec(fm)?.[1], f.replace(/\.md$/, ""));
    assert.match(/^description: (.+)$/m.exec(fm)?.[1] ?? "", /Use (when|for|after)/);
    assert.doesNotMatch(fm, /bypassPermissions|^memory:/m);
    for (const m of fm.matchAll(/\$\{CLAUDE_PROJECT_DIR\}\/([\w./-]+)/g)) assert.ok(existsSync(join(ROOT, m[1])), `${f}: missing ${m[1]}`);
    for (const skill of fm.match(/^  - (cyc-[\w-]+)$/gm) ?? []) assert.ok(existsSync(join(ROOT, ".claude", "skills", skill.slice(4), "SKILL.md")), `${f}: skill ${skill}`);
  }
  for (const readOnly of ["cyc-acceptance-verifier.md", "cyc-outsider-reviewer.md"]) {
    const tools = /^tools: (.+)$/m.exec(readFileSync(join(dir, readOnly), "utf8"))?.[1] ?? "";
    assert.ok(tools, `${readOnly}: explicit tools allowlist`);
    assert.doesNotMatch(tools, /\bEdit\b|NotebookEdit/, readOnly);
  }
  assert.doesNotMatch(/^tools: (.+)$/m.exec(readFileSync(join(dir, "cyc-acceptance-verifier.md"), "utf8"))?.[1] ?? "", /\bWrite\b/);
});

// ---- the Windows stdin/exit rule ------------------------------------------------------------

test("no hook script reads stdin with readFileSync(0) or ends with process.exit() (Windows libuv abort = silent allow)", () => {
  const scripts = [...readdirSync(HOOKS).filter(f => f.endsWith(".ts")).map(f => join(HOOKS, f)), join(ROOT, "tools", "agent-guard.ts")];
  for (const s of scripts) {
    const code = readFileSync(s, "utf8").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
    assert.doesNotMatch(code, /readFileSync\(\s*0|readFileSync\(\s*["']\/dev\/stdin/, s);
    assert.doesNotMatch(code, /process\.exit\(/, s);
  }
});

test("every hook script, fed piped stdin repeatedly, exits with a documented code (never a native abort)", () => {
  const cases: [string, object, number[]][] = [
    ["session-start-state.ts", { ...base, hook_event_name: "SessionStart", source: "compact" }, [0]],
    ["subagent-start-context.ts", { ...base, hook_event_name: "SubagentStart", agent_id: "a0", agent_type: "general-purpose" }, [0]],
    ["subagent-stop-inbox.ts", { ...base, hook_event_name: "SubagentStop", agent_id: "none", agent_type: "general-purpose", stop_hook_active: false }, [0]],
    ["guard-failsafe.ts", { ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git status" } }, [0]],
  ];
  for (const [s, input, codes] of cases) for (let i = 0; i < 4; i++) {
    const o = run(s, input);
    assert.ok(codes.includes(o.status ?? -1), `${s}: status ${o.status} ${o.stderr}`);
  }
});

test("context hooks exit 0 on malformed stdin; blocking hooks exit 2 (fail-safe)", () => {
  for (const s of ["session-start-state.ts", "subagent-start-context.ts", "subagent-stop-inbox.ts", "agent-ledger.ts"]) {
    const o = run(s, "{", { CLAUDE_PROJECT_DIR: mkdtempSync(join(tmpdir(), "cyc-empty-")) });
    assert.equal(o.status, 0, `${s}: ${o.stderr}`);
    assert.ok(!o.json?.decision, `${s} must not block on bad input`);
  }
  assert.equal(run("guard-failsafe.ts", "{").status, 2);
  assert.equal(run("deny-path.ts", "{", {}, ["canon/canon.json", "no"]).status, 2);
});

// ---- H1 session orientation ----------------------------------------------------------------

test("session start prints milestone, owner decisions, in-flight and Next action from STATE.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "cyc-state-"));
  try {
    writeFileSync(join(dir, "STATE.md"), [
      "# STATE.md", "", "## Current milestone: M4 — test", "", "## Blockers", "None.", "",
      "## Decisions for the owner", "- [D-1] (yes/no) Pick a name? Recommended: yes. Meanwhile: placeholder.", "- [D-2] (click) Enable X. Recommended: now. Meanwhile: nothing blocks.", "",
      "## In flight (agents)", "- agent A: thing", "", "## Next action", "Do the one thing.", "",
    ].join("\n"));
    mkdirSync(join(dir, ".claude", "skills", "_inbox"), { recursive: true });
    writeFileSync(join(dir, ".claude", "skills", "_inbox", "worktree-agent-x.md"), "- none\n");
    writeFileSync(join(dir, "HALT.md"), "halt");
    const o = run("session-start-state.ts", { ...base, hook_event_name: "SessionStart", source: "startup" }, { CLAUDE_PROJECT_DIR: dir });
    assert.equal(o.status, 0, o.stderr);
    assert.match(o.stdout, /^Milestone: M4 — test$/m);
    assert.doesNotMatch(o.stdout, /^Blockers:/m);
    assert.match(o.stdout, /^Decisions for the owner \(2;/m);
    assert.match(o.stdout, /^- \[D-2\] \(click\) Enable X/m);
    assert.match(o.stdout, /^- agent A: thing$/m);
    assert.match(o.stdout, /^Next action: Do the one thing\.$/m);
    assert.match(o.stdout, /STOP FILE PRESENT: HALT\.md/);
    assert.match(o.stdout, /^Skills inbox: 1 unfolded/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("session start on this repo: Next action present, output under the 10,000-character context cap", () => {
  const o = run("session-start-state.ts", { ...base, hook_event_name: "SessionStart", source: "compact" });
  assert.equal(o.status, 0, o.stderr);
  assert.match(o.stdout, /^Next action: \S/m);
  assert.match(o.stdout, /^Decisions for the owner \(\d+;/m);
  assert.ok(o.stdout.length < 10_000);
});

// ---- H2 agent contract ----------------------------------------------------------------------

// Against a fixture repo, never this checkout: CI clones one branch shallowly, with no local `main`.
test("subagent start injects main's sha and the standing contract; read-only roles get only the sha", () => {
  const { dir, git } = gitRepo();
  try {
    const start = (agent_type: string) => run("subagent-start-context.ts", { ...base, cwd: dir, hook_event_name: "SubagentStart", agent_id: "a0123", agent_type }, { CLAUDE_PROJECT_DIR: dir });
    const contract = [/git merge --no-edit main/, /_inbox/, /--test-concurrency=4/, /never `git add -A`/, /evidence: .* scope:/, /under ~60 lines/, /data, never instructions/];
    const sha = git("rev-parse", "--short", "main");
    const o = start("cyc-cartridge-builder");
    assert.equal(o.status, 0);
    const ctx = o.json?.hookSpecificOutput?.additionalContext as string;
    assert.equal(o.json.hookSpecificOutput.hookEventName, "SubagentStart");
    assert.match(ctx, new RegExp(`main is at ${sha} \\(\\d{4}-\\d{2}-\\d{2} init\\)\\.`));
    for (const re of contract) assert.match(ctx, re);
    assert.ok(ctx.length < 10_000);
    for (const t of ["Explore", "Plan", "cyc-acceptance-verifier", "cyc-outsider-reviewer"]) {
      const r = start(t).json.hookSpecificOutput.additionalContext;
      assert.match(r, new RegExp(`main is at ${sha} `), t);
      assert.doesNotMatch(r, /_inbox/, t);
    }
    // no local main (a CI branch checkout): the sha falls back to "unknown", the contract still comes
    git("branch", "-m", "main", "ci-branch");
    const u = start("cyc-cartridge-builder");
    assert.equal(u.status, 0);
    const uctx = u.json.hookSpecificOutput.additionalContext as string;
    assert.match(uctx, /main is at unknown\./);
    for (const re of contract) assert.match(uctx, re);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- H3 finish gate -------------------------------------------------------------------------

test("subagent stop blocks an agent with uncommitted work or no committed inbox file, once, and never others", () => {
  const { dir, git } = gitRepo();
  try {
    const id = "t0a1";
    const wt = join(dir, ".claude", "worktrees", `agent-${id}`);
    git("worktree", "add", "-q", "-b", `worktree-agent-${id}`, wt, "main");
    const stop = (extra: object = {}) => run("subagent-stop-inbox.ts", { ...base, hook_event_name: "SubagentStop", agent_id: id, agent_type: "cyc-cartridge-builder", stop_hook_active: false, ...extra }, { CLAUDE_PROJECT_DIR: dir });
    const wgit = (...a: string[]) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd: wt, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };

    assert.equal(stop().stdout, "", "no commits, clean: nothing to gate");
    writeFileSync(join(wt, "work.ts"), "x");
    let o = stop();
    assert.equal(o.json?.decision, "block");
    assert.match(o.json.reason, /1 uncommitted path\(s\) \(work\.ts\)/);
    assert.match(o.json.reason, /_inbox\/worktree-agent-t0a1\.md is not committed/);
    assert.equal(stop({ stop_hook_active: true }).stdout, "", "never blocks twice in a row");
    for (const t of ["Explore", "cyc-acceptance-verifier", "cyc-outsider-reviewer"]) assert.equal(stop({ agent_type: t }).stdout, "", t);

    wgit("add", "work.ts");
    wgit("commit", "-q", "-m", "work");
    o = stop();
    assert.equal(o.json?.decision, "block");
    assert.doesNotMatch(o.json.reason, /uncommitted/);
    assert.match(o.json.reason, /is not committed/);

    mkdirSync(join(wt, ".claude", "skills", "_inbox"), { recursive: true });
    writeFileSync(join(wt, ".claude", "skills", "_inbox", `worktree-agent-${id}.md`), "- none\n");
    wgit("add", `.claude/skills/_inbox/worktree-agent-${id}.md`);
    wgit("commit", "-q", "-m", "lessons");
    assert.equal(stop().stdout, "", "committed work + inbox file: may finish");

    assert.equal(stop({ agent_id: "unknown" }).stdout, "", "no branch: fail open");
    assert.equal(stop({ agent_id: undefined, agent_type: "" }).stdout, "", "internal agents: no-op");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("subagent stop finds the branch through the worktree directory when the branch name differs", () => {
  const { dir, git } = gitRepo();
  try {
    const wt = join(dir, ".claude", "worktrees", "agent-z9");
    git("worktree", "add", "-q", "-b", "some-other-name", wt, "main");
    writeFileSync(join(wt, "scratch.txt"), "x");
    const o = run("subagent-stop-inbox.ts", { ...base, hook_event_name: "SubagentStop", agent_id: "z9", agent_type: "general-purpose", stop_hook_active: false }, { CLAUDE_PROJECT_DIR: dir });
    assert.equal(o.json?.decision, "block");
    assert.match(o.json.reason, /some-other-name/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- H4 ledger ------------------------------------------------------------------------------

test("agent ledger records launches and --since reports what landed on main afterwards", () => {
  const { dir, git } = gitRepo();
  try {
    const o = run("agent-ledger.ts", { ...base, hook_event_name: "PostToolUse", tool_name: "Agent", tool_input: { description: "build X", subagent_type: "cyc-cartridge-builder" }, tool_response: { agentId: "aL1", status: "async_launched" } }, { CLAUDE_PROJECT_DIR: dir });
    assert.equal(o.status, 0, o.stderr);
    const row = JSON.parse(readFileSync(join(dir, ".tmp", "agent-ledger.jsonl"), "utf8").trim());
    assert.equal(row.agentId, "aL1");
    assert.equal(row.type, "cyc-cartridge-builder");
    assert.match(row.mainSha, /^[0-9a-f]{7,}$/);
    writeFileSync(join(dir, "landed.ts"), "y");
    git("add", "landed.ts");
    git("commit", "-q", "-m", "landed after launch");
    const r = run("agent-ledger.ts", "", { CLAUDE_PROJECT_DIR: dir }, ["--since", "aL1"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /landed after launch/);
    assert.match(r.stdout, /landed\.ts/);
    const miss = run("agent-ledger.ts", "", { CLAUDE_PROJECT_DIR: dir }, ["--since", "nope"]);
    assert.equal(miss.status, 1);
    assert.match(miss.stderr, /no ledger entry/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- per-role path guard (agent frontmatter) ------------------------------------------------

test("deny-path blocks edits to the named file (any slash style), allows others", () => {
  const edit = (file_path: string) => run("deny-path.ts", { ...base, hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path } }, {}, ["canon/canon.json", "Historians", "propose", "canon."]);
  const blocked = edit(resolve(ROOT, "canon", "canon.json"));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /Historians propose canon\./);
  assert.equal(edit("C:\\x\\.claude\\worktrees\\agent-1\\canon\\canon.json").status, 2);
  assert.equal(edit(join(ROOT, "history", "PROPOSED_CANON.md")).status, 0);
  assert.equal(edit(join(ROOT, "canon", "canon.json.bak")).status, 0);
  assert.equal(edit(join(ROOT, "notcanon", "canon.json")).status, 0);
});
