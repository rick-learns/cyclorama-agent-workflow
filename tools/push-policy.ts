// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Main-branch push policy (owner decision 2026-09-26; CONTRIBUTING.md "Branches and commit messages"):
// main changes only by `git merge --no-ff <branch>` (done by the integrator after verify and
// test-integrity). The one exception is a bookkeeping commit that touches nothing but STATE.md
// and/or DECISIONS.md. main is never deleted.
//   node tools/push-policy.ts <remote> <url>     pre-push hook (.githooks/pre-push): reads git's
//                                                `<local ref> <local sha> <remote ref> <remote sha>`
//                                                lines on stdin; only updates of refs/heads/main count
//   node tools/push-policy.ts --range <a>..<b>   the first-parent commits of a range (CI reuse)
// A "direct commit on main" is a first-parent commit of the pushed range that is not a merge. For a
// new main on the remote (remote sha all zeros) the range is every commit not on any remote ref.
// Exit 0 = allowed, 1 = refused (reasons on stderr), 2 = usage or git error. No network.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAIN_REF = "refs/heads/main";
/** Root files the integrator may commit directly on main (CI paths-ignores them too). */
export const BOOKKEEPING: ReadonlySet<string> = new Set(["STATE.md", "DECISIONS.md"]);

export interface MainCommit { sha: string; parents: string[]; files: string[]; subject: string }
export interface RefUpdate { localRef: string; localSha: string; remoteRef: string; remoteSha: string }

const isZero = (sha: string) => /^0+$/.test(sha);
const HOW = "land it on a <type>/<topic> branch and have the integrator `git merge --no-ff` it (only STATE.md/DECISIONS.md-only commits may go on main directly)";

/** Refusals for the first-parent commits that a push (or a CI range) adds to main; [] = allowed. */
export function checkMainPush(commits: MainCommit[]): string[] {
  const errors: string[] = [];
  for (const { sha, parents, files, subject } of commits) {
    if (parents.length > 1) continue;
    const other = files.filter(f => !BOOKKEEPING.has(f));
    if (other.length === 0) continue;
    const shown = other.length > 6 ? [...other.slice(0, 6), `… ${other.length - 6} more`] : other;
    errors.push(`${sha.slice(0, 8)} ${subject}: direct commit on main touches ${shown.join(", ")} — ${HOW}`);
  }
  return errors;
}

/** git's pre-push stdin: one `<local ref> <local sha> <remote ref> <remote sha>` line per ref. */
export function parsePrePushInput(text: string): RefUpdate[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const [localRef, localSha, remoteRef, remoteSha] = l.split(/\s+/);
    return { localRef, localSha, remoteRef, remoteSha };
  });
}

/** Refuses deleting main; returns the updates of main whose commits still need checkMainPush. */
export function checkRefUpdates(updates: RefUpdate[]): { errors: string[]; mainUpdates: RefUpdate[] } {
  const errors: string[] = [], mainUpdates: RefUpdate[] = [];
  for (const u of updates) {
    if (u.remoteRef !== MAIN_REF) continue;
    if (isZero(u.localSha)) errors.push("deleting main on the remote is refused: main is always green and deployable");
    else mainUpdates.push(u);
  }
  return { errors, mainUpdates };
}

function git(args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** The first-parent commits `git rev-list --first-parent <revs>` selects, with their changed files. */
function firstParentCommits(revs: string[]): MainCommit[] {
  const list = git(["rev-list", "--first-parent", ...revs]);
  if (!list.ok) throw new Error(`git rev-list ${revs.join(" ")} failed: ${list.err.trim()}`);
  return list.out.split("\n").filter(Boolean).map(sha => {
    const meta = git(["show", "-s", "--format=%P%x00%s", sha]);
    if (!meta.ok) throw new Error(`git show ${sha} failed: ${meta.err.trim()}`);
    const [p, subject] = meta.out.replace(/\n$/, "").split("\0");
    const parents = p.split(" ").filter(Boolean);
    if (parents.length > 1) return { sha, parents, files: [], subject };
    const diff = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "--root", sha]);
    if (!diff.ok) throw new Error(`git diff-tree ${sha} failed: ${diff.err.trim()}`);
    return { sha, parents, files: diff.out.split("\0").filter(Boolean), subject };
  });
}

function revsFor(u: RefUpdate): string[] {
  const known = !isZero(u.remoteSha) && git(["cat-file", "-e", `${u.remoteSha}^{commit}`]).ok;
  return known ? [`${u.remoteSha}..${u.localSha}`] : [u.localSha, "--not", "--remotes"];
}

function main(argv: string[]): number {
  const errors: string[] = [];
  let label: string;
  try {
    if (argv[0] === "--range") {
      if (!argv[1] || argv.length !== 2) { console.error("usage: node tools/push-policy.ts --range <a>..<b>"); return 2; }
      label = argv[1];
      errors.push(...checkMainPush(firstParentCommits([argv[1]])));
    } else {
      if (argv.some(a => a.startsWith("--"))) { console.error("usage: node tools/push-policy.ts <remote> <url> (pre-push hook, ref lines on stdin) | --range <a>..<b>"); return 2; }
      label = `push to ${argv[0] ?? "remote"}`;
      const { errors: refErrors, mainUpdates } = checkRefUpdates(parsePrePushInput(readFileSync(0, "utf8")));
      errors.push(...refErrors);
      for (const u of mainUpdates) errors.push(...checkMainPush(firstParentCommits(revsFor(u))));
    }
  } catch (e) {
    console.error(`push-policy: ${(e as Error).message}`);
    return 2;
  }
  if (!errors.length) return 0;
  console.error(`push-policy: ${label} refused (main changes only by \`git merge --no-ff <branch>\`; CONTRIBUTING.md "Branches and commit messages"):\n  ${errors.join("\n  ")}`);
  return 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
