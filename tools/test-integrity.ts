// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Test-integrity check for an agent branch (AGENTIC_PRACTICES §7): fails when a branch gets green
// by weakening the evidence instead of fixing the code.
//   node tools/test-integrity.ts <base> <branch>      (also accepts <base>...<branch> or <base>..<branch>)
// Compares the branch with its merge-base against <base> (so later commits on main never count).
// FAILS (exit 1) when, without a DECISIONS.md line added on the branch that names the file:
//   - a test file (tests/**/*.test.ts) is deleted, or renamed to a non-test path;
//   - the number of test declarations (test/it) or assertions (assert.*, expect) across the
//     changed test files drops (moving tests between files is fine: the totals are compared);
//   - a test file gains `.skip`, `.only`, `.todo`, `skip:` or `todo:`;
//   - an expected hash changes (replays/*, roms/manifest.json, or a hex literal of 8+ digits
//     replaced in a test file) with no ROM/toolchain source change in the same diff;
//   - a verify/CI/npm script gains --test-name-pattern, --test-skip-pattern or --test-only.
// Exit 0 = no finding, 1 = findings (listed), 2 = usage or git error. Deterministic, no network.
import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Change { status: "A" | "M" | "D" | "R"; path: string; oldPath?: string }
export interface Repo {
  /** Content at the base side (merge-base), or null if absent. */
  before: (path: string) => string | null;
  /** Content at the branch side, or null if absent. */
  after: (path: string) => string | null;
}

const isTest = (p: string) => /^tests\/.*\.test\.ts$/.test(p);
const isHashFile = (p: string) => /^replays\//.test(p) || p === "roms/manifest.json";
const isRomSource = (p: string) =>
  (/^roms\//.test(p) && p !== "roms/manifest.json") ||
  /^src\/(machine|asm|scrim)\//.test(p) ||
  /^tools\/(build-roms|art|song|asm|scrim)\.ts$/.test(p);
const isRunner = (p: string) => p === "tools/verify.ts" || p === "package.json" || /^\.github\/workflows\//.test(p);

export const countTests = (src: string) => (src.match(/(?<![\w.])(?:test|it)(?:\.(?:skip|only|todo))?\s*\(/g) ?? []).length;
export const countAsserts = (src: string) => (src.match(/(?<![\w.])(?:assert(?:\.\w+)*|expect)\s*\(/g) ?? []).length;
/** Blank out string and template literal contents (fixtures that merely mention `.skip(`). */
const stripStrings = (l: string) => l.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
const SKIP_RE =/\.(skip|only|todo)\s*\(|\b(skip|todo)\s*:/;
const RUNNER_RE = /--test-(name|skip)-pattern|--test-only/;
const HEX_RE = /["'`]([0-9a-f]{8,})["'`]/gi;

function addedRemoved(before: string | null, after: string | null): { added: string[]; removed: string[] } {
  const b = (before ?? "").split(/\r?\n/), a = (after ?? "").split(/\r?\n/);
  const count = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
  const bm = count(b), am = count(a);
  const added = a.filter(l => { const n = bm.get(l) ?? 0; if (n > 0) { bm.set(l, n - 1); return false; } return true; });
  const removed = b.filter(l => { const n = am.get(l) ?? 0; if (n > 0) { am.set(l, n - 1); return false; } return true; });
  return { added, removed };
}

/** Findings (empty = pass). */
export function checkIntegrity(changes: Change[], repo: Repo): string[] {
  const findings: string[] = [];
  const hashChanged: string[] = [];
  const decisions = addedRemoved(repo.before("DECISIONS.md"), repo.after("DECISIONS.md")).added.join("\n");
  const waived = (p: string) => decisions.includes(p) || decisions.includes(basename(p));
  const flag = (p: string, msg: string) => { if (!waived(p)) findings.push(`${p}: ${msg}`); };

  let testsBefore = 0, testsAfter = 0, assertsBefore = 0, assertsAfter = 0;
  const shrunk: string[] = [];
  for (const c of changes) {
    const oldPath = c.oldPath ?? c.path;
    const wasTest = isTest(oldPath) && c.status !== "A";
    const nowTest = isTest(c.path) && c.status !== "D";
    if (c.status === "D" && isTest(c.path)) flag(c.path, "test file deleted");
    if (c.status === "R" && isTest(oldPath) && !isTest(c.path)) flag(oldPath, `test file renamed to non-test path ${c.path}`);
    if ((!wasTest && !nowTest) || waived(c.path) || waived(oldPath)) continue;
    const before = wasTest ? repo.before(oldPath) : null;
    const after = nowTest ? repo.after(c.path) : null;
    const tb = countTests(before ?? ""), ta = countTests(after ?? ""), ab = countAsserts(before ?? ""), aa = countAsserts(after ?? "");
    testsBefore += tb; testsAfter += ta; assertsBefore += ab; assertsAfter += aa;
    if (ta < tb || aa < ab) shrunk.push(`${c.path} (tests ${tb}→${ta}, asserts ${ab}→${aa})`);
    const { added, removed } = addedRemoved(before, after);
    for (const l of added) if (SKIP_RE.test(stripStrings(l)) && !/^\s*(\/\/|\*|\/\*)/.test(l)) flag(c.path, `adds a skip/only/todo: ${l.trim().slice(0, 120)}`);
    const oldHex = new Set(removed.flatMap(l => [...l.matchAll(HEX_RE)].map(m => m[1].toLowerCase())));
    const newHex = added.flatMap(l => [...l.matchAll(HEX_RE)].map(m => m[1].toLowerCase()));
    if (oldHex.size && newHex.some(h => !oldHex.has(h))) hashChanged.push(c.path);
  }
  if (testsAfter < testsBefore) findings.push(`test declarations dropped ${testsBefore}→${testsAfter} across changed test files: ${shrunk.join("; ")}`);
  if (assertsAfter < assertsBefore) findings.push(`assertions dropped ${assertsBefore}→${assertsAfter} across changed test files: ${shrunk.join("; ")}`);

  for (const c of changes) if (isHashFile(c.path) && c.status !== "A") hashChanged.push(c.path);
  if (hashChanged.length && !changes.some(c => isRomSource(c.path))) {
    for (const p of [...new Set(hashChanged)]) flag(p, "expected hash/replay changed with no ROM or toolchain source change in the diff (never edit a hash by hand; regenerate it from a real change)");
  }

  for (const c of changes) {
    if (!isRunner(c.path) || c.status === "D") continue;
    for (const l of addedRemoved(repo.before(c.oldPath ?? c.path), repo.after(c.path)).added) {
      if (RUNNER_RE.test(l)) flag(c.path, `narrows the test run: ${l.trim().slice(0, 120)}`);
    }
  }
  return findings;
}

// ---- git + CLI ---------------------------------------------------------------------------

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 << 20, windowsHide: true });
  return { ok: r.status === 0, out: r.stdout ?? "", err: (r.stderr ?? "").trim() };
}

export function run(argv: string[], cwd = process.cwd()): { code: number; text: string } {
  let [base, head] = argv;
  if (base && !head) [base, head] = base.includes("...") ? base.split("...") : base.split("..");
  if (!base || !head) return { code: 2, text: "usage: node tools/test-integrity.ts <base> <branch>" };
  const mb = git(["merge-base", base, head], cwd);
  if (!mb.ok) return { code: 2, text: `git merge-base ${base} ${head} failed: ${mb.err}` };
  const from = mb.out.trim();
  const diff = git(["diff", "--name-status", "-M", from, head], cwd);
  if (!diff.ok) return { code: 2, text: `git diff failed: ${diff.err}` };
  const changes: Change[] = diff.out.split(/\r?\n/).filter(Boolean).map(l => {
    const [st, a, b] = l.split("\t");
    return st.startsWith("R") ? { status: "R", oldPath: a, path: b } : { status: st[0] as Change["status"], path: a };
  });
  const show = (rev: string) => (p: string) => { const r = git(["show", `${rev}:${p}`], cwd); return r.ok ? r.out : null; };
  const findings = checkIntegrity(changes, { before: show(from), after: show(head) });
  const tests = changes.filter(c => isTest(c.path) || isTest(c.oldPath ?? "")).length;
  const header = `test-integrity ${base}...${head} (merge-base ${from.slice(0, 7)}): ${changes.length} changed file(s), ${tests} test file(s)`;
  return findings.length
    ? { code: 1, text: `${header}\nFAIL (${findings.length}):\n${findings.map(f => `- ${f}`).join("\n")}\nA deliberate change needs a DECISIONS.md line on the branch naming the file.` }
    : { code: 0, text: `${header}\nOK: no deleted, skipped or weakened tests, no hand-edited hashes, no narrowed test runs.` };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const r = run(process.argv.slice(2));
  (r.code === 0 ? process.stdout : process.stderr).write(r.text + "\n");
  process.exitCode = r.code;
}
