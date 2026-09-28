// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// tools/checkout-lock.ts: who is the integrator of the shared checkout (the claim rule, TTL,
// release, status), the `pushed <sha>` check against origin/main, and the SessionStart hook
// (tools/hooks/session-start-state.ts) recording {session, branch, time} under .git/, never in the
// working tree. Pure functions with injected git and liveness; the CLI and hook against temp repos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LOCK_NAME, TTL_MS, claim, emptyLock, holderState, parseLock, pushedReport, checkPushed, release, statusLines, worktreeHint,
  type Claimant, type GitRun, type LockFile,
} from "../tools/checkout-lock.ts";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const ROOT = "/Users/rick/dev/anotherFunGame";
const T0 = Date.parse("2026-09-27T08:00:00.000Z");
const me = (session: string, pid: number | null, now = T0, branch: string | null = "main"): Claimant => ({ session, pid, branch, checkout: ROOT, now, source: "startup" });
const alive = (pids: number[]) => (pid: number) => pids.includes(pid);
const heldBy = (session: string, pid: number | null, at = T0): LockFile => claim(emptyLock(), me(session, pid, at), alive([])).file;

test("claim: the first session takes a free checkout; the holder refreshes; another live session is refused", () => {
  const first = claim(emptyLock(), me(A, 100), alive([100]));
  assert.equal(first.outcome, "claimed");
  assert.equal(first.file.holder?.session, A);
  assert.equal(first.file.holder?.branch, "main");
  assert.equal(first.file.holder?.claimedAt, "2026-09-27T08:00:00.000Z");
  assert.match(first.lines.join("\n"), /this session \(aaaaaaaa\) is the integrator of \/Users\/rick\/dev\/anotherFunGame/);

  const again = claim(first.file, { ...me(A, 101, T0 + 3_600_000), source: "resume" }, alive([101]));
  assert.equal(again.outcome, "refreshed");
  assert.equal(again.file.holder?.pid, 101, "a resumed session in a new process keeps the claim and records the new pid");
  assert.equal(again.file.holder?.claimedAt, "2026-09-27T08:00:00.000Z");
  assert.equal(again.file.holder?.seenAt, "2026-09-27T09:00:00.000Z");

  const other = claim(again.file, me(B, 200, T0 + 7_200_000), alive([101, 200]));
  assert.equal(other.outcome, "held");
  assert.equal(other.file.holder?.session, A, "a live claim is never taken");
  const text = other.lines.join("\n");
  assert.match(text, /belongs to integrator session aaaaaaaa/);
  assert.match(text, /must not checkout, switch or rebase there/);
  assert.ok(text.includes("git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main"), text);
  // every attempt is recorded, capped
  assert.deepEqual(other.file.recent.map(r => [r.session, r.outcome]), [[A, "claimed"], [A, "refreshed"], [B, "held"]]);
  let f = other.file;
  for (let i = 0; i < 30; i++) f = claim(f, me(B, 200, T0 + i), alive([101, 200])).file;
  assert.equal(f.recent.length, 20);
});

test("claim: the same Claude process after /clear moves the claim; an ended or stale holder is taken over with a note or warning", () => {
  const moved = claim(heldBy(A, 100), { ...me(B, 100, T0 + 60_000), source: "clear" }, alive([100]));
  assert.equal(moved.outcome, "moved");
  assert.equal(moved.file.holder?.session, B);

  const ended = claim(heldBy(A, 100), me(B, 200, T0 + 60_000), alive([200]));
  assert.equal(ended.outcome, "took-over-ended");
  assert.equal(ended.file.holder?.session, B);
  assert.match(ended.lines.join("\n"), /previous integrator session aaaaaaaa has ended/);

  const young = claim(heldBy(A, null), me(B, 200, T0 + TTL_MS - 1), alive([200]));
  assert.equal(young.outcome, "held", "without a pid, only the TTL ends a claim");
  const stale = claim(heldBy(A, 100), me(B, 200, T0 + TTL_MS), alive([100, 200]));
  assert.equal(stale.outcome, "took-over-stale");
  assert.equal(stale.file.holder?.session, B);
  assert.match(stale.lines.join("\n"), /^WARNING: took over a stale claim from session aaaaaaaa/m);
  assert.match(stale.lines.join("\n"), /24h/);

  const forced = claim(heldBy(A, 100), me(B, 200, T0 + 1), alive([100, 200]), true);
  assert.equal(forced.outcome, "forced");
  assert.match(forced.lines.join("\n"), /^WARNING: forced/m);

  const offMain = claim(emptyLock(), me(A, 100, T0, "feat/x"), alive([100]));
  assert.match(offMain.lines.join("\n"), /WARNING: the shared checkout is on 'feat\/x', not main/);

  assert.equal(holderState(heldBy(A, 100).holder!, T0 + 1, alive([100])), "live");
  assert.equal(holderState(heldBy(A, 100).holder!, T0 + 1, alive([])), "ended");
  assert.equal(holderState(heldBy(A, 100).holder!, T0 + TTL_MS, alive([100])), "stale");
});

test("release: only the holder (or --force), and parseLock tolerates garbage", () => {
  const f = heldBy(A, 100);
  const byOther = release(f, B, false);
  assert.equal(byOther.ok, false);
  assert.equal(byOther.file.holder?.session, A);
  assert.match(byOther.lines.join("\n"), /held by session aaaaaaaa/);
  const byHolder = release(f, A, false);
  assert.equal(byHolder.ok, true);
  assert.equal(byHolder.file.holder, null);
  assert.equal(release(f, B, true).file.holder, null);
  assert.equal(release(emptyLock(), A, false).ok, true);

  assert.deepEqual(parseLock("{ nope"), emptyLock());
  assert.deepEqual(parseLock(JSON.stringify({ version: 1, holder: { session: 7 }, recent: "x" })), emptyLock());
  assert.equal(parseLock(JSON.stringify(f)).holder?.session, A);

  const s = statusLines(f, ROOT, "main", T0 + 1, alive([100]), B).join("\n");
  assert.match(s, /Shared checkout: \/Users\/rick\/dev\/anotherFunGame \(branch main\)/);
  assert.match(s, new RegExp(`Integrator: session ${A} .*live`));
  assert.match(s, /This session .* is not the integrator/);
  assert.match(statusLines(emptyLock(), ROOT, "main", T0, alive([]), undefined).join("\n"), /Integrator: none claimed/);
  assert.equal(worktreeHint("/x/anotherFunGame"), "git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main");
});

// ---- pushed <sha> -----------------------------------------------------------------------------

type Call = { args: string[]; cwd: string };
function fakeGit(over: Record<string, { status: number; stdout?: string; stderr?: string }>): { run: GitRun; calls: Call[] } {
  const calls: Call[] = [];
  const run: GitRun = (args, cwd) => {
    calls.push({ args, cwd });
    const key = Object.keys(over).find(k => args.join(" ").startsWith(k));
    const r = key ? over[key] : { status: 0, stdout: "" };
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
  return { run, calls };
}
const SHA = "c020d1d0000000000000000000000000000000aa";
const ORIGIN = "d80d9fa0000000000000000000000000000000bb";
const okGit = (ancestor: number, branch = "main") => fakeGit({
  "fetch": { status: 0 }, [`rev-parse --verify --quiet ${SHA}^{commit}`]: { status: 0, stdout: SHA + "\n" },
  "rev-parse --verify --quiet c020d1d^{commit}": { status: 0, stdout: SHA + "\n" },
  "rev-parse --verify --quiet origin/main^{commit}": { status: 0, stdout: ORIGIN + "\n" },
  "merge-base --is-ancestor": { status: ancestor }, "symbolic-ref": { status: 0, stdout: branch + "\n" },
});

test("pushed: exit 0 only when the commit is an ancestor of origin/main after a fetch, and it prints the shared checkout's branch", () => {
  const on = okGit(0);
  const r = checkPushed("c020d1d", ROOT, on.run);
  assert.equal(r.code, 0, r.lines.join("\n"));
  assert.match(r.lines.join("\n"), /c020d1d is on origin\/main \(at d80d9fa\)/);
  assert.match(r.lines.join("\n"), /Shared checkout \/Users\/rick\/dev\/anotherFunGame is on branch main/);
  const order = on.calls.map(c => c.args[0]);
  assert.ok(order.indexOf("fetch") < order.indexOf("merge-base"), "fetch before the ancestry check");
  assert.deepEqual(on.calls.find(c => c.args[0] === "merge-base")?.args, ["merge-base", "--is-ancestor", SHA, "origin/main"]);
  assert.equal(on.calls.find(c => c.args[0] === "symbolic-ref")?.cwd, ROOT);

  const off = checkPushed(SHA, ROOT, okGit(1, "feat/wrong").run);
  assert.equal(off.code, 1);
  assert.match(off.lines.join("\n"), /NOT on origin\/main/);
  assert.match(off.lines.join("\n"), /WARNING: the shared checkout is on 'feat\/wrong', not main/);

  const noFetch = checkPushed(SHA, ROOT, fakeGit({ "fetch": { status: 128, stderr: "fatal: unable to access" } }).run);
  assert.equal(noFetch.code, 2);
  assert.match(noFetch.lines.join("\n"), /could not fetch origin main.*unable to access/);

  const bad = checkPushed("nope", ROOT, fakeGit({ "fetch": { status: 0 }, "rev-parse --verify --quiet nope": { status: 1 } }).run);
  assert.equal(bad.code, 2);
  assert.match(bad.lines.join("\n"), /unknown commit 'nope'/);

  const weird = checkPushed(SHA, ROOT, okGit(128).run);
  assert.equal(weird.code, 2);

  assert.equal(pushedReport({ root: ROOT, sha: SHA, fetch: { ok: true, err: "" }, resolved: SHA, originMain: ORIGIN, ancestor: 0, branch: null }).code, 0);
  assert.match(pushedReport({ root: ROOT, sha: SHA, fetch: { ok: true, err: "" }, resolved: SHA, originMain: ORIGIN, ancestor: 0, branch: null }).lines.join("\n"), /detached/);
});

// ---- CLI and SessionStart hook against temp repos ---------------------------------------------

function repo(): { dir: string; git: (cwd: string, ...a: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), "cyc-lock-"));
  const git = (cwd: string, ...a: string[]) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${a.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const work = join(dir, "anotherFunGame");
  git(dir, "init", "-q", "--bare", "-b", "main", "origin.git");
  git(dir, "init", "-q", "-b", "main", "anotherFunGame");
  writeFileSync(join(work, "STATE.md"), "# STATE\n\n## Next action\nDo it.\n");
  git(work, "add", "STATE.md");
  git(work, "commit", "-q", "-m", "init");
  git(work, "remote", "add", "origin", join(dir, "origin.git"));
  git(work, "push", "-q", "origin", "main");
  return { dir, git };
}
const cli = (cwd: string, args: string[], env: Record<string, string> = {}) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(process.cwd(), "tools", "checkout-lock.ts"), ...args], {
  cwd, encoding: "utf8", env: { ...process.env, CLAUDE_CODE_SESSION_ID: "", CLAUDE_PID: "", ...env },
});
const hook = (projectDir: string, input: object, env: Record<string, string> = {}) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(process.cwd(), "tools", "hooks", "session-start-state.ts")], {
  cwd: projectDir, encoding: "utf8", input: JSON.stringify(input),
  env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_CODE_SESSION_ID: "", CLAUDE_PID: "", ...env },
});

test("CLI: claim, status, release and pushed against a real repo; the lock lives in .git/, not the working tree", () => {
  const { dir, git } = repo();
  const work = join(dir, "anotherFunGame");
  try {
    const pid = String(process.pid);
    const c1 = cli(work, ["claim"], { CLAUDE_CODE_SESSION_ID: A, CLAUDE_PID: pid });
    assert.equal(c1.status, 0, c1.stderr);
    assert.match(c1.stdout, /is the integrator/);
    const lockPath = join(work, ".git", LOCK_NAME);
    assert.ok(existsSync(lockPath));
    assert.equal(git(work, "status", "--porcelain"), "", "nothing in the working tree");
    const c2 = cli(work, ["claim", "--session", B]);
    assert.equal(c2.status, 1, "a live claim is refused");
    assert.match(c2.stdout + c2.stderr, /belongs to integrator session aaaaaaaa/);
    assert.equal(cli(work, ["claim"]).status, 2, "no session id: nothing to claim for");
    const st = cli(work, ["status", "--session", B]);
    assert.equal(st.status, 0);
    assert.match(st.stdout, new RegExp(`Integrator: session ${A}`));
    assert.match(st.stdout, /Recent session starts/);
    assert.equal(cli(work, ["release", "--session", B]).status, 1);
    assert.equal(cli(work, ["release", "--session", A]).status, 0);
    assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).holder, null);

    // pushed: the pushed commit is on origin/main; a local-only commit is not.
    const head = git(work, "rev-parse", "HEAD");
    const on = cli(work, ["pushed", head]);
    assert.equal(on.status, 0, on.stdout + on.stderr);
    assert.match(on.stdout, /is on branch main/);
    writeFileSync(join(work, "b.txt"), "b");
    git(work, "add", "b.txt");
    git(work, "commit", "-q", "-m", "local only");
    const off = cli(work, ["pushed"]);
    assert.equal(off.status, 1, "HEAD by default; not pushed yet");
    assert.match(off.stdout, /is NOT on origin\/main/);
    // From a linked worktree the helper still reports the shared checkout's branch.
    git(work, "worktree", "add", "-q", "-b", "docs/plan", join(dir, "anotherFunGame-plan"), "origin/main");
    const fromWt = cli(join(dir, "anotherFunGame-plan"), ["pushed", head]);
    assert.equal(fromWt.status, 0, fromWt.stderr);
    assert.match(fromWt.stdout, /anotherFunGame is on branch main/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SessionStart hook records {session, branch, time} for the shared checkout under .git/ and names the integrator", () => {
  const { dir, git } = repo();
  const work = join(dir, "anotherFunGame");
  try {
    const lockPath = join(work, ".git", LOCK_NAME);
    const base = { hook_event_name: "SessionStart", transcript_path: "t", permission_mode: "default", cwd: work };
    const first = hook(work, { ...base, session_id: A, source: "startup" }, { CLAUDE_PID: String(process.pid) });
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /^\[cyc\] Checkout lock: this session \(aaaaaaaa\) is the integrator/m);
    assert.match(first.stdout, /^Next action: Do it\.$/m, "the orientation block still prints");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    assert.equal(lock.holder.session, A);
    assert.equal(lock.holder.branch, "main");
    assert.equal(lock.holder.pid, process.pid);
    assert.match(lock.recent[0].time, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(git(work, "status", "--porcelain"), "");

    const second = hook(work, { ...base, session_id: B, source: "startup" });
    assert.equal(second.status, 0);
    assert.match(second.stdout, /belongs to integrator session aaaaaaaa/);
    assert.ok(second.stdout.includes("git worktree add ../anotherFunGame-<name> -b <type>/<topic> origin/main"));
    const after = JSON.parse(readFileSync(lockPath, "utf8"));
    assert.equal(after.holder.session, A);
    assert.deepEqual(after.recent.map((r: { session: string; branch: string }) => [r.session, r.branch]), [[A, "main"], [B, "main"]]);

    // Not a harness session id (tests, malformed input): nothing is recorded.
    const before = readFileSync(lockPath, "utf8");
    assert.equal(hook(work, { ...base, session_id: "s", source: "compact" }).status, 0);
    assert.equal(hook(work, "{" as unknown as object).status, 0);
    assert.equal(readFileSync(lockPath, "utf8"), before);

    // A session in a linked worktree never claims the shared checkout; it is told who has it.
    const wt = join(dir, "anotherFunGame-plan");
    git(work, "worktree", "add", "-q", "-b", "docs/plan", wt, "main");
    writeFileSync(join(work, ".git", LOCK_NAME), JSON.stringify({ version: 1, holder: null, recent: [] }));
    const w = hook(wt, { ...base, cwd: wt, session_id: B, source: "startup" }, { CLAUDE_PID: String(process.pid) });
    assert.equal(w.status, 0, w.stderr);
    assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).holder, null);
    assert.match(w.stdout, /Checkout lock: .*anotherFunGame has no integrator claim/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
