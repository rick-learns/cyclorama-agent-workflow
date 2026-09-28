// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Claude Code PreToolUse guard (wired in .claude/settings.json for the Bash and PowerShell tools).
// Blocks the few commands that destroy work in a repo where many agents share one .git:
// force pushes, pushes / main-ref writes from worktree agents, `git reset --hard` on main,
// hook bypasses, `git clean -x`, bare `git stash` / `stash pop`, and recursive deletes of the
// repo, its top-level source dirs, .git or the agent worktrees.
//
// Also enforces two written workflow rules: agents never stage everything (`git add -A/./:/`),
// and the lead shell never `cd`s into an agent worktree.
//
// Checkout lock: in the integrator's shared checkout (this repo's main working tree, not a linked
// worktree), `git checkout <x>`, `git switch` and `git rebase` are blocked unless the session id is
// the one recorded by tools/checkout-lock.ts (subagents never pass). `git checkout -- <path>` stays
// allowed. No readable claim means no integrator: blocked, with the command that claims.
//
// Best effort, not a security boundary: it parses the command text Claude writes (the Claude
// Code docs say the same of permission rules). It FAILS SAFE: input it cannot read, or an internal
// error while checking a Bash/PowerShell command, blocks the call (exit 2). Settings run it through
// tools/hooks/guard-failsafe.ts, which also turns a crash, hang or load failure of this file into
// a block. Hook protocol: JSON on stdin; exit 2 with the reason on stderr blocks the tool call.
// Never call process.exit() here (Windows Node 23 can abort with a libuv assertion after reading
// stdin, and Claude Code treats that exit code as "allow"): set process.exitCode and return.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LOCK_NAME, readLock, worktreeHint, type Holder } from "./checkout-lock.ts";

export interface GuardContext {
  cwd: string;
  shell: "bash" | "powershell";
  /** Current branch of the checkout containing `dir`, or null if unknown / detached. */
  branchOf: (dir: string) => string | null;
  /** Checkout roots containing `dir`, innermost first (a worktree root, then the main checkout). */
  rootsOf: (dir: string) => string[];
  /** Top-level directory names of a checkout root. */
  topLevelDirs: (root: string) => string[];
  /** True inside a subagent (the hook input carries `agent_id`). */
  isSubagent?: boolean;
  /** The Claude Code session id (hook input `session_id`). */
  sessionId?: string | undefined;
  /** The integrator's shared checkout root when `dir` is inside its working tree (not a linked
   *  worktree), else null. Absent: the checkout-lock rule is off. */
  sharedCheckoutOf?: (dir: string) => string | null;
  /** The recorded integrator claim of a shared checkout, or null when none can be read. */
  integratorOf?: (root: string) => Holder | null;
}

// Top-level directories whose loss costs nothing (generated or re-installable).
const DISPOSABLE = new Set([".tmp", "build", "dist", "node_modules", "test-results", "playwright-report", "blob-report", "coverage"]);
const MAIN_BRANCHES = new Set(["main", "master"]);
const WORKTREE_RE = /\/\.claude\/worktrees\/[^/]+/;

// ---- paths -------------------------------------------------------------------------------

/** Normalise to forward slashes, `/c/x` and `C:\x` to `c:/x`, resolve `.` and `..`. */
export function normPath(p: string): string {
  let s = p.replace(/\\/g, "/");
  const msys = /^\/([a-zA-Z])(\/|$)/.exec(s);
  if (msys) s = `${msys[1]}:/${s.slice(3)}`;
  if (/^[a-zA-Z]:/.test(s)) s = s[0].toLowerCase() + s.slice(1);
  const drive = /^[a-z]:/.exec(s)?.[0] ?? "";
  const out: string[] = [];
  for (const part of s.slice(drive.length).split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return `${drive}/${out.join("/")}`;
}
const isAbs = (p: string) => /^([a-zA-Z]:)?[\\/]/.test(p);
const join = (base: string, p: string) => normPath(isAbs(p) ? p : `${base}/${p}`);
const sameOrUnder = (p: string, dir: string) => p === dir || p.startsWith(dir.endsWith("/") ? dir : dir + "/");

// ---- tokenising --------------------------------------------------------------------------

/** Split a shell command into simple commands (token lists). Separators: ; & | && || newline ( ) `. */
export function segments(cmd: string, shell: "bash" | "powershell"): string[][] {
  const esc = shell === "bash" ? "\\" : "`";
  const segs: string[][] = [];
  let toks: string[] = [], cur = "", has = false, q: string | null = null;
  const endTok = () => { if (has) toks.push(cur); cur = ""; has = false; };
  const endSeg = () => { endTok(); if (toks.length) segs.push(toks); toks = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === esc && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
    } else if (c === "'" || c === '"') { q = c; has = true; }
    else if (c === esc && shell === "bash" && i + 1 < cmd.length) { cur += cmd[++i]; has = true; }
    else if (/\s/.test(c) && c !== "\n") endTok();
    else if (c === "\n" || c === ";" || c === "&" || c === "|" || c === "(" || c === ")" || (c === "`" && shell === "bash")) endSeg();
    else { cur += c; has = true; }
  }
  endSeg();
  return segs;
}

const WRAPPERS = new Set(["sudo", "env", "command", "time", "nohup", "exec", "builtin"]);
const cmdName = (t: string) => t.replace(/\\/g, "/").split("/").pop()!.replace(/\.exe$/i, "").toLowerCase();

// ---- rules -------------------------------------------------------------------------------

const FORCE_PUSH = "Force pushes are disabled for Claude sessions in this repo (they rewrite shared history). If one is really needed, the owner runs it by hand.";

function checkGit(args: string[], dir: string, c: GuardContext): string | null {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    const a = args[i];
    if (a === "-C") { dir = join(dir, args[i + 1] ?? "."); i += 2; continue; }
    if (a === "-c") {
      if (/^core\.hookspath=/i.test(args[i + 1] ?? "")) return "Overriding core.hooksPath bypasses the project's git hooks. Fix the failing check instead.";
      i += 2; continue;
    }
    i++;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  const inWorktree = WORKTREE_RE.test(normPath(dir) + "/");
  const cluster = (t: string, letters: RegExp) => /^-[a-zA-Z]+$/.test(t) && letters.test(t);

  if (rest.includes("--no-verify") && ["commit", "push", "merge", "am", "rebase", "cherry-pick"].includes(sub ?? "")) {
    return "--no-verify skips the project's git hooks. Fix the failing check instead (the owner may bypass by hand).";
  }
  const lock = checkCheckoutLock(sub, rest, dir, c);
  if (lock) return lock;
  switch (sub) {
    case "add":
      if ((inWorktree || c.isSubagent) && rest.some(t => t === "--all" || t === "." || t === "./" || t === ":/" || t === "*" || cluster(t, /A/))) {
        return "Stage specific paths (`git add <path> ...`), never -A/--all/./:/ (skill cyc-iteration §4): agent worktrees pick up scratch files, .tmp/ and build output.";
      }
      return null;
    case "push": {
      for (const t of rest) {
        if (t === "--force" || t === "--mirror" || t.startsWith("--force-with-lease") || t === "--force-if-includes" || cluster(t, /f/)) return FORCE_PUSH;
        if (!t.startsWith("-") && t.startsWith("+")) return FORCE_PUSH;
        if (!t.startsWith("-") && /^:(refs\/heads\/)?(main|master)$/.test(t)) return "Deleting the remote main branch is blocked.";
      }
      if ((rest.includes("--delete") || rest.includes("-d")) && rest.some(t => MAIN_BRANCHES.has(t))) return "Deleting the remote main branch is blocked.";
      if (inWorktree) return "Worktree agents do not push. Commit on your branch; the lead session merges and pushes.";
      return null;
    }
    case "fetch":
      if (inWorktree && rest.some(t => /:(refs\/heads\/)?(main|master)$/.test(t))) return "Worktree agents must not write the main branch ref. Commit on your branch; the lead merges.";
      return null;
    case "update-ref":
      if (inWorktree) return "Worktree agents must not write refs directly (refs are shared with the main checkout).";
      return null;
    case "branch": {
      const writes = rest.some(t => ["-f", "--force", "-D", "-d", "--delete", "-M", "-m", "--move", "-C", "-c", "--copy"].includes(t));
      if (inWorktree && writes && rest.some(t => MAIN_BRANCHES.has(t))) return "Worktree agents must not move, copy over or delete the main branch.";
      return null;
    }
    case "reset":
      if (rest.includes("--hard") && MAIN_BRANCHES.has(c.branchOf(dir) ?? "")) {
        return "`git reset --hard` on main is blocked (it discards uncommitted work and can drop merged commits). Use `git merge --abort`, `git revert`, or ask the owner to run it by hand.";
      }
      return null;
    case "clean":
      if (rest.some(t => cluster(t, /[xX]/))) return "`git clean -x/-X` deletes ignored files, including node_modules that every worktree resolves through. Remove the specific paths instead (e.g. rm -rf .tmp build).";
      return null;
    case "commit": {
      const takesValue = new Set(["-m", "-F", "-C", "-c", "-t", "--message", "--file", "--author", "--date", "--template", "--trailer", "--fixup", "--squash", "--reuse-message", "--reedit-message"]);
      for (let k = 0; k < rest.length; k++) {
        const t = rest[k];
        if (takesValue.has(t)) { k++; continue; }
        if (cluster(t, /n/) && !/[mFCct].*n/.test(t)) return "`git commit -n` skips the project's git hooks. Fix the failing check instead.";
      }
      return null;
    }
    case "stash": {
      const [op, ...more] = rest;
      const SAFE = "The git stash stack is shared by every session and worktree. Use a WIP commit, or `git stash push -u -m \"<unique-tag>\"` then `git stash apply <sha>` (never pop).";
      if (op === undefined || op === "pop") return SAFE;
      if (op === "push" || op.startsWith("-")) {
        const all = op === "push" ? more : rest;
        if (!all.some(t => t === "-m" || t === "--message" || t.startsWith("--message="))) return SAFE;
      }
      return null;
    }
  }
  return null;
}

/** True for the git commands that move a checkout's HEAD: checkout (except path restores), switch, rebase. */
function movesHead(sub: string | undefined, rest: string[]): boolean {
  if (sub === "rebase") return true;
  if (sub === "switch") return rest.length > 0;
  if (sub === "checkout") {
    if (rest.length === 0) return false; // prints status
    return !rest.some(t => t === "--" || t === "-p" || t === "--patch" || t.startsWith("--pathspec-from-file"));
  }
  return false;
}

function checkCheckoutLock(sub: string | undefined, rest: string[], dir: string, c: GuardContext): string | null {
  if (!c.sharedCheckoutOf || !movesHead(sub, rest)) return null;
  const root = c.sharedCheckoutOf(dir);
  if (!root) return null;
  const h = c.integratorOf?.(root) ?? null;
  if (h && !c.isSubagent && c.sessionId && h.session === c.sessionId) return null;
  const owner = h ? `integrator session ${h.session.slice(0, 8)} (claimed ${h.claimedAt}, branch ${h.branch ?? "detached"})` : "the integrator, but no integrator claim is recorded";
  const self = c.isSubagent ? "Agents work in their own worktree."
    : h ? `This session${c.sessionId ? ` (${c.sessionId.slice(0, 8)})` : ""} is not the integrator (\`node tools/checkout-lock.ts status\`).`
      : "If this session is the integrator, run `node tools/checkout-lock.ts claim` first.";
  return `${root} is the shared checkout of ${owner}: other sessions never checkout, switch or rebase there. Run \`${worktreeHint(root)}\` and work in that folder. ${self}`;
}

function isRecursiveFlag(t: string, shell: "bash" | "powershell"): boolean {
  const l = t.toLowerCase();
  if (l === "--recursive") return true;
  if (shell === "powershell" && /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/.test(l)) return true;
  return shell === "bash" && /^-[rfdvi]+$/i.test(t) && /r/i.test(t);
}

function protectedTarget(target: string, dir: string, c: GuardContext): string | null {
  const t = target.trim();
  if (["/", "~", "~/", "$HOME", "${HOME}", "/*", "~/*"].includes(t) || /^[a-zA-Z]:[\\/]?\*?$/.test(t)) return t;
  if (/[$%~]/.test(t)) return null; // cannot resolve variables: fail open
  const glob = t.includes("*");
  const path = join(dir, glob ? t.slice(0, t.indexOf("*")).replace(/[^/\\]*$/, "") || "." : t);
  for (const root of c.rootsOf(dir).map(normPath)) {
    // The root itself or anything above it (a glob at the root counts as the root).
    if (sameOrUnder(root, path)) return root;
    if (!sameOrUnder(path, root)) continue;
    const rel = path.slice(root.length + 1).split("/");
    if (rel[0] === ".git") return path;
    if (rel[0] === ".claude" && (rel.length === 1 || (rel[1] === "worktrees" && rel.length <= 3))) return path;
    if (rel.length === 1 && !DISPOSABLE.has(rel[0]) && c.topLevelDirs(root).includes(rel[0])) return path;
  }
  return null;
}

function checkRemove(name: string, args: string[], dir: string, c: GuardContext): string | null {
  const ps = c.shell === "powershell";
  const isRm = ps ? ["remove-item", "ri", "rm", "del", "erase", "rd", "rmdir"].includes(name) : name === "rm";
  if (!isRm || !args.some(a => isRecursiveFlag(a, c.shell))) return null;
  const valueParams = new Set(["-filter", "-include", "-exclude", "-credential", "-stream"]);
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (ps && valueParams.has(a.toLowerCase())) { k++; continue; }
    if (a.startsWith("-") && !(ps && /^-(path|literalpath)$/i.test(a))) continue;
    if (ps && /^-(path|literalpath)$/i.test(a)) continue; // the value is the next token
    const hit = protectedTarget(a, dir, c);
    if (hit) return `Recursive delete of ${hit} is blocked: it is the repo, a source directory, .git or an agent worktree. Delete specific generated paths instead (.tmp, build), or use \`git worktree remove\` for a finished worktree.`;
  }
  return null;
}

/** Subagents never deploy the website or touch the Cloudflare token or the brand mailbox's Bridge
 *  login (owner decisions 2026-09-26, 2026-09-27): production deploys are the lead's, from
 *  verified main (tools/deploy-site.ts). */
function checkDeploy(name: string, args: string[]): string | null {
  const why = "Deploying playcyclorama.com, the Cloudflare token and the mailbox login are the lead's only: report what should be deployed or sent instead.";
  if (args.some(a => /playcyclorama(-mail)?\.env|CLOUDFLARE_API_TOKEN|PROTON_BRIDGE_/.test(a))) return why;
  if (name === "wrangler" || ((name === "npx" || name === "pnpm" || name === "bunx") && args.some(a => /^wrangler(@|$)/.test(a)))) return why;
  if (name === "npm" && /^run(-script)?$/.test(args[0] ?? "") && args[1] === "deploy") return why;
  if (name === "node" && args.some(a => /(^|\/)tools\/deploy-site\.ts$/.test(a))) return why;
  return null;
}

/** Returns a reason to block the command, or null to allow it. */
export function checkCommand(command: string, c: GuardContext): string | null {
  let dir = normPath(c.cwd);
  for (const seg of segments(command, c.shell)) {
    let k = 0;
    while (k < seg.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(seg[k]) || WRAPPERS.has(cmdName(seg[k])))) k++;
    if (k >= seg.length) continue;
    const name = cmdName(seg[k]);
    const args = seg.slice(k + 1);
    if (["cd", "pushd", "set-location", "sl", "chdir"].includes(name)) {
      const to = args.find(a => !a.startsWith("-"));
      if (to && !/[$%~]/.test(to)) {
        const next = join(dir, to);
        // The lead shell must not enter an agent worktree (it moves the session's working
        // directory). A lead session that itself runs in a worktree may move within it.
        const target = WORKTREE_RE.exec(next + "/")?.[0];
        if (target && !c.isSubagent && WORKTREE_RE.exec(dir + "/")?.[0] !== target) {
          return "Don't cd into .claude/worktrees/* from the lead shell (it moves the session's working directory). Use `git -C <worktree> ...`, branch refs, or Read with an absolute path.";
        }
        dir = next;
      }
      continue;
    }
    if (c.isSubagent) {
      const deploy = checkDeploy(name, args);
      if (deploy) return deploy;
    }
    const reason = name === "git" ? checkGit(args, dir, c) : checkRemove(name, args, dir, c);
    if (reason) return reason;
  }
  return null;
}

// ---- real context + hook entry point -----------------------------------------------------

function findRoots(dir: string): string[] {
  let d = resolve(dir);
  for (;;) {
    if (existsSync(resolve(d, ".git"))) break;
    const up = resolve(d, "..");
    if (up === d) return [];
    d = up;
  }
  const roots = [d];
  const m = /^(.*)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/.exec(d);
  if (m) roots.push(m[1]);
  return roots;
}

// The native realpath expands Windows 8.3 short names (C:\Users\RUNNER~1\…) the way git's own
// paths are expanded; the JS realpathSync keeps them, so a short-name cwd never matched the shared
// checkout and the lock rule silently switched off (GitHub windows-latest, where TEMP is short).
const real = (p: string): string => { try { return normPath(realpathSync.native(p)); } catch { return normPath(resolve(p)); } };

/** This project's shared checkout (the main working tree of CLAUDE_PROJECT_DIR's repo), or null. */
function projectSharedRoot(): string | null {
  const from = process.env.CLAUDE_PROJECT_DIR || resolve(import.meta.dirname, "..");
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: from, encoding: "utf8", timeout: 3000, windowsHide: true });
  const common = r.status === 0 ? r.stdout.trim() : "";
  return common && basename(common) === ".git" ? real(dirname(common)) : null;
}

/** The main working tree containing `dir` when it is this project's (unknown project: every main
 *  working tree counts, failing closed). Linked worktrees (`.git` is a file) never count. */
function sharedCheckoutOf(dir: string): string | null {
  const root = findRoots(dir.replace(/^\/([a-zA-Z])\//, "$1:/"))[0];
  if (!root) return null;
  try { if (!statSync(resolve(root, ".git")).isDirectory()) return null; } catch { return null; }
  const shared = projectSharedRoot();
  return shared === null || real(root) === shared ? normPath(root) : null;
}

export const realContext = (cwd: string, shell: "bash" | "powershell"): GuardContext => ({
  cwd, shell, sharedCheckoutOf,
  integratorOf: root => readLock(resolve(root, ".git", LOCK_NAME)).holder,
  branchOf: dir => {
    const r = spawnSync("git", ["-C", dir, "symbolic-ref", "--short", "-q", "HEAD"], { encoding: "utf8", timeout: 3000 });
    return r.status === 0 ? r.stdout.trim() : null;
  },
  rootsOf: dir => findRoots(dir.replace(/^\/([a-zA-Z])\//, "$1:/")),
  topLevelDirs: root => {
    try { return readdirSync(root).filter(n => statSync(resolve(root, n)).isDirectory()); } catch { return []; }
  },
});

const FAIL_SAFE = "Blocked by tools/agent-guard.ts (fail-safe)";

async function main(): Promise<number> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch {
    process.stderr.write(`${FAIL_SAFE}: the hook input was not JSON, so the command could not be checked.\n`);
    return 2;
  }
  const tool = input?.tool_name;
  const command = input?.tool_input?.command;
  if ((tool !== "Bash" && tool !== "PowerShell") || typeof command !== "string") return 0;
  const isSubagent = typeof input.agent_id === "string" && input.agent_id !== "";
  const sessionId = typeof input.session_id === "string" && input.session_id ? input.session_id : process.env.CLAUDE_CODE_SESSION_ID || undefined;
  const c = { ...realContext(input.cwd ?? process.cwd(), tool === "Bash" ? "bash" : "powershell"), isSubagent, sessionId };
  const reason = checkCommand(command, c);
  if (!reason) return 0;
  process.stderr.write(`Blocked by tools/agent-guard.ts: ${reason}\n`);
  return 2;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(
    code => { process.exitCode = code; },
    err => {
      process.stderr.write(`${FAIL_SAFE}: internal error ${String(err).slice(0, 300)}. Fix the guard (node --test tests/agent-guard.test.ts).\n`);
      process.exitCode = 2;
    },
  );
}
