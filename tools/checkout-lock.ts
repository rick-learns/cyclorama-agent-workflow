// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Checkout lock for the integrator's shared checkout (the main working tree, e.g.
// /Users/rick/dev/anotherFunGame). Twice on 2026-09-26/27 another session switched its branch
// mid-integration and a lead merge landed on the wrong branch (4dba17e, c020d1d).
//
//   node tools/checkout-lock.ts status  [--session <id>]   who holds the checkout, its branch, recent starts
//   node tools/checkout-lock.ts claim   [--session <id>] [--force]
//   node tools/checkout-lock.ts release [--session <id>] [--force]
//   node tools/checkout-lock.ts pushed  [<sha>]            exit 0 only if <sha> (default HEAD) is on origin/main
//
// The claim lives in <git common dir>/cyc-checkout-lock.json: under .git/, never in the working
// tree, shared by every worktree of the repo. The session id comes from --session, else
// CLAUDE_CODE_SESSION_ID (set by Claude Code in the Bash tool; hooks get `session_id` in their input).
//
// Who is the integrator (rule, applied by `claim` and by the SessionStart hook for every session that
// starts in the shared checkout itself):
//   - no claim recorded                        -> the claimant takes it;
//   - the claim is this session's              -> refreshed (pid, branch, seenAt);
//   - same Claude process (CLAUDE_PID), new id -> moved (a /clear or resume in the same process);
//   - the holder's Claude process has exited   -> taken over, with a note;
//   - the holder was last seen >= TTL ago       -> taken over, with a WARNING (TTL_HOURS = 24);
//   - `claim --force`                          -> taken over, with a WARNING (the owner's call only);
//   - otherwise                                -> refused: the claimant is told to use a worktree.
// Liveness uses the recorded CLAUDE_PID when there is one; without a pid only the TTL ends a claim.
// tools/agent-guard.ts blocks checkout/switch/rebase in the shared checkout from every session
// whose id is not the holder's (and from every subagent).
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const LOCK_NAME = "cyc-checkout-lock.json";
export const TTL_HOURS = 24;
export const TTL_MS = TTL_HOURS * 3_600_000;
const MAX_RECENT = 20;

export interface Holder { session: string; pid: number | null; branch: string | null; checkout: string; claimedAt: string; seenAt: string }
export type Outcome = "claimed" | "refreshed" | "moved" | "took-over-ended" | "took-over-stale" | "forced" | "held";
export interface StartRow { session: string; pid: number | null; branch: string | null; time: string; source: string; outcome: Outcome }
export interface LockFile { version: 1; holder: Holder | null; recent: StartRow[] }
export interface Claimant { session: string; pid: number | null; branch: string | null; checkout: string; now: number; source: string }
export type HolderState = "live" | "ended" | "stale";

export const emptyLock = (): LockFile => ({ version: 1, holder: null, recent: [] });
export const isSessionId = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const short = (s: string) => s.slice(0, 8);
const iso = (ms: number) => new Date(ms).toISOString();
const isPid = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isInteger(v) && v > 0);
const optStr = (v: unknown): v is string | null => v === null || typeof v === "string";

export const worktreeHint = (root: string) => `git worktree add ../${basename(root)}-<name> -b <type>/<topic> origin/main`;

/** A lock file's contents, or an empty lock for anything unreadable (a lock names no one unless valid). */
export function parseLock(text: string): LockFile {
  try {
    const v = JSON.parse(text);
    const h = v?.holder;
    const holderOk = h === null || (h && typeof h === "object" && isSessionId(h.session) && isPid(h.pid) && optStr(h.branch) &&
      typeof h.checkout === "string" && typeof h.claimedAt === "string" && typeof h.seenAt === "string");
    if (v?.version !== 1 || !holderOk || !Array.isArray(v.recent)) return emptyLock();
    return { version: 1, holder: h, recent: v.recent.filter((r: unknown) => r && typeof r === "object").slice(-MAX_RECENT) };
  } catch {
    return emptyLock();
  }
}

export function holderState(h: Holder, now: number, isAlive: (pid: number) => boolean): HolderState {
  if (h.pid !== null && !isAlive(h.pid)) return "ended";
  const seen = Date.parse(h.seenAt);
  return !Number.isFinite(seen) || now - seen >= TTL_MS ? "stale" : "live";
}

function describe(h: Holder): string {
  return `integrator session ${short(h.session)} (claimed ${h.claimedAt}, last seen ${h.seenAt}, pid ${h.pid ?? "unknown"}, branch ${h.branch ?? "detached"})`;
}

/** Apply the claim rule (file header) for `me`; returns the new file and the lines to print. */
export function claim(file: LockFile, me: Claimant, isAlive: (pid: number) => boolean, force = false): { outcome: Outcome; file: LockFile; lines: string[] } {
  const h = file.holder;
  const notes: string[] = [];
  let outcome: Outcome;
  if (!h) outcome = "claimed";
  else if (h.session === me.session) outcome = "refreshed";
  else {
    const state = holderState(h, me.now, isAlive);
    if (me.pid !== null && h.pid === me.pid && state !== "ended") {
      outcome = "moved";
      notes.push(`Claim moved from session ${short(h.session)} (same Claude process ${me.pid}: /clear or resume).`);
    } else if (state === "ended") {
      outcome = "took-over-ended";
      notes.push(`The previous integrator session ${short(h.session)} has ended (its Claude process ${h.pid} is gone).`);
    } else if (state === "stale") {
      outcome = "took-over-stale";
      notes.push(`WARNING: took over a stale claim from session ${short(h.session)} (last seen ${h.seenAt}, older than the ${TTL_HOURS}h TTL). If that session is still integrating, stop it or hand the checkout back.`);
    } else if (force) {
      outcome = "forced";
      notes.push(`WARNING: forced the claim away from live ${describe(h)}. That session is no longer the integrator and will be blocked from checkout/switch/rebase here.`);
    } else outcome = "held";
  }
  const row: StartRow = { session: me.session, pid: me.pid, branch: me.branch, time: iso(me.now), source: me.source, outcome };
  const recent = [...file.recent, row].slice(-MAX_RECENT);
  if (outcome === "held") {
    return {
      outcome, file: { ...file, recent },
      lines: [`Checkout lock: ${me.checkout} belongs to ${describe(h!)}. This session must not checkout, switch or rebase there: run \`${worktreeHint(me.checkout)}\` and work in that folder.`],
    };
  }
  const holder: Holder = {
    session: me.session, pid: me.pid, branch: me.branch, checkout: me.checkout,
    claimedAt: outcome === "refreshed" ? h!.claimedAt : iso(me.now), seenAt: iso(me.now),
  };
  const lines = [`Checkout lock: this session (${short(me.session)}) is the integrator of ${me.checkout} (branch ${me.branch ?? "detached"}). Only it may checkout, switch or rebase there; other sessions use \`${worktreeHint(me.checkout)}\`.`, ...notes];
  if (me.branch !== "main") lines.push(`WARNING: the shared checkout is on '${me.branch ?? "a detached HEAD"}', not main. Merges made now do not land on main.`);
  return { outcome, file: { version: 1, holder, recent }, lines };
}

export function release(file: LockFile, session: string | undefined, force: boolean): { ok: boolean; file: LockFile; lines: string[] } {
  const h = file.holder;
  if (!h) return { ok: true, file, lines: ["Checkout lock: nothing to release (no claim recorded)."] };
  if (h.session !== session && !force) {
    return { ok: false, file, lines: [`Checkout lock: the claim is held by session ${short(h.session)}, not this session; nothing released. (The owner can pass --force.)`] };
  }
  const lines = [`Checkout lock: released the claim of session ${short(h.session)}. The next session to start in ${h.checkout}, or \`node tools/checkout-lock.ts claim\`, becomes the integrator.`];
  if (h.session !== session) lines.unshift(`WARNING: releasing another session's claim (--force).`);
  return { ok: true, file: { ...file, holder: null }, lines };
}

export function statusLines(file: LockFile, root: string, branch: string | null, now: number, isAlive: (pid: number) => boolean, session: string | undefined): string[] {
  const out = [`Shared checkout: ${root} (branch ${branch ?? "detached"})`];
  if (branch !== "main") out.push(`WARNING: the shared checkout is on '${branch ?? "a detached HEAD"}', not main.`);
  const h = file.holder;
  if (!h) out.push("Integrator: none claimed (the next session to start here, or `node tools/checkout-lock.ts claim`, becomes it).");
  else {
    const state = holderState(h, now, isAlive);
    const why = state === "live" ? "live" : state === "ended" ? "ended: its Claude process is gone, the next claim takes it" : `stale: last seen over ${TTL_HOURS}h ago, the next claim takes it with a warning`;
    out.push(`Integrator: session ${h.session} pid ${h.pid ?? "unknown"}, claimed ${h.claimedAt}, last seen ${h.seenAt}, branch ${h.branch ?? "detached"} (${why}).`);
  }
  if (session) out.push(`This session (${short(session)}) ${h?.session === session ? "is" : "is not"} the integrator.`);
  if (file.recent.length) {
    out.push("Recent session starts:");
    for (const r of file.recent.slice(-5)) out.push(`  ${r.time} ${short(r.session)} ${r.source} on ${r.branch ?? "detached"}: ${r.outcome}`);
  }
  return out;
}

// ---- pushed <sha> ----------------------------------------------------------------------------

export type GitRun = (args: string[], cwd: string) => { status: number | null; stdout: string; stderr: string };
export interface PushedFacts {
  root: string; sha: string; fetch: { ok: boolean; err: string };
  resolved: string | null; originMain: string | null; ancestor: number | null; branch: string | null;
}

export function pushedReport(f: PushedFacts): { code: number; lines: string[] } {
  const where = [`Shared checkout ${f.root} is on branch ${f.branch ?? "(detached HEAD)"}.`];
  if (f.branch !== "main") where.push(`WARNING: the shared checkout is on '${f.branch ?? "a detached HEAD"}', not main: a merge made there did not land on main.`);
  if (!f.fetch.ok) return { code: 2, lines: [`could not fetch origin main (${f.fetch.err.trim().split("\n")[0] || "no detail"}); nothing verified.`, ...where] };
  if (!f.resolved) return { code: 2, lines: [`unknown commit '${f.sha}'.`, ...where] };
  const s = f.resolved.slice(0, 7), o = (f.originMain ?? "?").slice(0, 7);
  if (f.ancestor === 0) return { code: 0, lines: [`OK: ${s} is on origin/main (at ${o}).`, ...where] };
  if (f.ancestor === 1) return { code: 1, lines: [`${s} is NOT on origin/main (at ${o}). Push main (git push origin main) and rerun.`, ...where] };
  return { code: 2, lines: [`git merge-base --is-ancestor failed (status ${f.ancestor}); nothing verified.`, ...where] };
}

/** Fetch origin main, then check that `sha` (default HEAD of the shared checkout) is an ancestor of origin/main. */
export function checkPushed(sha: string | undefined, root: string, git: GitRun): { code: number; lines: string[] } {
  const want = sha ?? "HEAD";
  const f = git(["fetch", "--quiet", "origin", "main"], root);
  const b = git(["symbolic-ref", "--short", "-q", "HEAD"], root);
  const facts: PushedFacts = { root, sha: want, fetch: { ok: f.status === 0, err: f.stderr }, resolved: null, originMain: null, ancestor: null, branch: b.status === 0 ? b.stdout.trim() || null : null };
  if (facts.fetch.ok) {
    const r = git(["rev-parse", "--verify", "--quiet", `${want}^{commit}`], root);
    facts.resolved = r.status === 0 ? r.stdout.trim() || null : null;
    const o = git(["rev-parse", "--verify", "--quiet", "origin/main^{commit}"], root);
    facts.originMain = o.status === 0 ? o.stdout.trim() || null : null;
    if (facts.resolved) facts.ancestor = git(["merge-base", "--is-ancestor", facts.resolved, "origin/main"], root).status;
  }
  return pushedReport(facts);
}

// ---- real IO ---------------------------------------------------------------------------------

export const realGit: GitRun = (args, cwd) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, windowsHide: true });
  return { status: r.error ? null : r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? String(r.error ?? "") };
};

/** The shared checkout of the repo at `cwd`: its root, lock path, and whether `cwd` is in it (not in a linked worktree). */
export function locate(cwd: string, git: GitRun = realGit): { root: string; lockPath: string; inShared: boolean } | null {
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  const own = git(["rev-parse", "--path-format=absolute", "--git-dir"], cwd);
  if (common.status !== 0 || own.status !== 0) return null;
  const c = resolve(common.stdout.trim());
  if (basename(c) !== ".git") return null; // a bare repo has no shared checkout
  return { root: dirname(c), lockPath: join(c, LOCK_NAME), inShared: resolve(own.stdout.trim()) === c };
}

export const branchOf = (root: string, git: GitRun = realGit): string | null => {
  const r = git(["symbolic-ref", "--short", "-q", "HEAD"], root);
  return r.status === 0 ? r.stdout.trim() || null : null;
};

export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

/** The Claude Code process id: CLAUDE_PID, else the parent process when it is `claude` (hooks run as its children). */
export function claudePid(env: NodeJS.ProcessEnv, ppid = process.ppid): number | null {
  const n = Number(env.CLAUDE_PID);
  if (Number.isInteger(n) && n > 0) return n;
  if (process.platform === "win32") return null;
  const r = spawnSync("ps", ["-o", "comm=", "-p", String(ppid)], { encoding: "utf8", timeout: 2000 });
  return r.status === 0 && /(^|\/)claude$/i.test(r.stdout.trim()) ? ppid : null;
}

export function readLock(path: string): LockFile {
  try { return parseLock(readFileSync(path, "utf8")); } catch { return emptyLock(); }
}

function writeLock(path: string, file: LockFile): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n");
  renameSync(tmp, path);
}

/** Read-modify-write the lock under an exclusive mutex file (two sessions may start at once). */
export function updateLock<T>(path: string, fn: (f: LockFile) => { file: LockFile; result: T }): T {
  const mutex = `${path}.mutex`;
  const deadline = Date.now() + 3000;
  let fd: number | null = null;
  while (fd === null) {
    try { fd = openSync(mutex, "wx"); } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(mutex).mtimeMs > 10_000) { unlinkSync(mutex); continue; } } catch { continue; }
      if (Date.now() > deadline) throw new Error(`checkout lock busy (${mutex})`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const { file, result } = fn(readLock(path));
    writeLock(path, file);
    return result;
  } finally {
    closeSync(fd);
    try { unlinkSync(mutex); } catch { /* already gone */ }
  }
}

/** The SessionStart hook's part: record this session start for the shared checkout and apply the
 *  claim rule; from a linked worktree only report the holder. Returns lines for the context. */
export function recordSessionStart(projectDir: string, input: { session_id?: unknown; source?: unknown } | null, env: NodeJS.ProcessEnv = process.env): string[] {
  const session = input?.session_id;
  if (!isSessionId(session)) return []; // not a harness session (tests, malformed input): record nothing
  const loc = locate(projectDir);
  if (!loc) return [];
  if (!loc.inShared) {
    const h = existsSync(loc.lockPath) ? readLock(loc.lockPath).holder : null;
    return [h ? `Checkout lock: the shared checkout ${loc.root} belongs to ${describe(h)}; this session works in ${projectDir}.`
      : `Checkout lock: the shared checkout ${loc.root} has no integrator claim; this session works in ${projectDir}.`];
  }
  const me: Claimant = { session, pid: claudePid(env), branch: branchOf(loc.root), checkout: loc.root, now: Date.now(), source: typeof input?.source === "string" ? input.source : "startup" };
  return updateLock(loc.lockPath, f => { const r = claim(f, me, pidAlive); return { file: r.file, result: r.lines }; });
}

// ---- CLI -------------------------------------------------------------------------------------

function cli(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const force = rest.includes("--force");
  const si = rest.indexOf("--session");
  const session = si >= 0 ? rest[si + 1] : process.env.CLAUDE_CODE_SESSION_ID || undefined;
  const positional = rest.filter((a, i) => !a.startsWith("--") && !(si >= 0 && i === si + 1));
  const print = (lines: string[]) => process.stdout.write(lines.join("\n") + "\n");
  const loc = locate(process.cwd());
  if (!loc) { process.stderr.write("checkout-lock: not inside a git checkout with a .git directory\n"); return 2; }
  switch (cmd) {
    case "status":
      print(statusLines(readLock(loc.lockPath), loc.root, branchOf(loc.root), Date.now(), pidAlive, session));
      return 0;
    case "claim": {
      if (!isSessionId(session)) { process.stderr.write("checkout-lock claim: no session id. Run it from the integrator's Claude session (CLAUDE_CODE_SESSION_ID) or pass --session <uuid>.\n"); return 2; }
      const me: Claimant = { session, pid: claudePid(process.env), branch: branchOf(loc.root), checkout: loc.root, now: Date.now(), source: "cli claim" };
      const r = updateLock(loc.lockPath, f => { const c = claim(f, me, pidAlive, force); return { file: c.file, result: c }; });
      print(r.outcome === "held" ? [...r.lines, "Refused: the claim is live. Only when the owner says that session is gone: node tools/checkout-lock.ts claim --force"] : r.lines);
      return r.outcome === "held" ? 1 : 0;
    }
    case "release": {
      const r = updateLock(loc.lockPath, f => { const x = release(f, session, force); return { file: x.file, result: x }; });
      print(r.lines);
      return r.ok ? 0 : 1;
    }
    case "pushed": {
      const r = checkPushed(positional[0], loc.root, realGit);
      print(r.lines);
      return r.code;
    }
    default:
      process.stderr.write("usage: node tools/checkout-lock.ts status|claim|release [--session <id>] [--force] | pushed [<sha>]\n");
      return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = cli(process.argv.slice(2));
}
