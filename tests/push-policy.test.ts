// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// tools/push-policy.ts: main changes only by `git merge --no-ff <branch>`; the integrator may commit
// directly only when the commit touches nothing but STATE.md and/or DECISIONS.md; main is never
// deleted (owner decision 2026-09-26; CONTRIBUTING.md "Branches and commit messages").
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMainPush, checkRefUpdates, parsePrePushInput, type MainCommit } from "../tools/push-policy.ts";

const Z = "0".repeat(40);
const c = (sha: string, parents: string[], files: string[], subject = "x"): MainCommit => ({ sha: sha.repeat(40).slice(0, 40), parents, files, subject });

test("--no-ff merges and bookkeeping-only commits may land on main", () => {
  assert.deepEqual(checkMainPush([
    c("a", ["1", "2"], [], "Merge branch 'feat/branch-policy'"),
    c("b", ["a"], ["STATE.md"], "docs(state): next action"),
    c("c", ["b"], ["DECISIONS.md", "STATE.md"], "docs: record the owner decision"),
  ]), []);
  assert.deepEqual(checkMainPush([]), []);
});

test("a direct commit that touches anything besides STATE.md/DECISIONS.md is refused", () => {
  const mixed = checkMainPush([c("d", ["c"], ["STATE.md", "tools/push-policy.ts"], "chore: sneak code in with state")]);
  assert.equal(mixed.length, 1);
  assert.match(mixed[0], /dddddddd .*chore: sneak code in with state/);
  assert.match(mixed[0], /tools\/push-policy\.ts/);
  assert.doesNotMatch(mixed[0], /STATE\.md,/);
  assert.match(mixed[0], /merge --no-ff/);
  const plain = checkMainPush([c("a", ["1", "2"], []), c("e", ["a"], ["src/machine/cpu.ts"], "fix(cpu): carry flag")]);
  assert.equal(plain.length, 1);
  assert.match(plain[0], /eeeeeeee/);
  // Only exact root paths count as bookkeeping.
  assert.equal(checkMainPush([c("f", ["e"], ["docs/STATE.md"])]).length, 1);
});

test("pre-push input: deleting main is refused, other refs are ignored, main updates are returned", () => {
  const sha = "1".repeat(40), old = "2".repeat(40);
  const lines = parsePrePushInput([
    `(delete) ${Z} refs/heads/main ${old}`,
    `refs/heads/feat/x ${sha} refs/heads/feat/x ${Z}`,
    `refs/heads/main ${sha} refs/heads/main ${old}`,
    `refs/tags/v1 ${sha} refs/tags/v1 ${Z}`,
    `refs/heads/main ${sha} refs/heads/mainline ${Z}`,
    "",
  ].join("\n"));
  assert.equal(lines.length, 5);
  const r = checkRefUpdates(lines);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /delet.*main/i);
  assert.deepEqual(r.mainUpdates, [{ localRef: "refs/heads/main", localSha: sha, remoteRef: "refs/heads/main", remoteSha: old }]);
  assert.deepEqual(checkRefUpdates(parsePrePushInput(`refs/heads/feat/x ${sha} refs/heads/feat/x ${old}\n`)), { errors: [], mainUpdates: [] });
});

test("CLI: pre-push hook (stdin ref lines) and --range mode over a real repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "cyc-push-policy-"));
  const tool = join(process.cwd(), "tools", "push-policy.ts");
  const cli = (input: string, ...a: string[]) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", tool, ...a], { cwd: dir, encoding: "utf8", input });
  const git = (...a: string[]) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const commit = (file: string, msg: string) => { writeFileSync(join(dir, file), msg); git("add", file); git("commit", "-q", "-m", msg); return git("rev-parse", "HEAD"); };
  try {
    git("init", "-q", "-b", "main");
    const base = commit("a.ts", "base");
    git("checkout", "-q", "-b", "feat/x");
    commit("b.ts", "feat: add b");
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "--no-edit", "feat/x");
    const state = commit("STATE.md", "docs(state): record it");
    const ok = cli(`refs/heads/main ${state} refs/heads/main ${base}\n`, "origin", "git@example.invalid:x.git");
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(cli("", "--range", `${base}..${state}`).status, 0);

    const code = commit("c.ts", "fix: direct code");
    const bad = cli(`refs/heads/main ${code} refs/heads/main ${base}\n`, "origin", "url");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, new RegExp(`${code.slice(0, 8)} fix: direct code.*c\\.ts`));
    assert.doesNotMatch(bad.stderr, /feat: add b/, "second-parent (branch) commits are not direct commits");
    const range = cli("", "--range", `${base}..${code}`);
    assert.equal(range.status, 1);
    assert.match(range.stderr, /c\.ts/);

    assert.equal(cli(`(delete) ${Z} refs/heads/main ${code}\n`, "origin", "url").status, 1);
    assert.equal(cli(`refs/heads/feat/x ${code} refs/heads/feat/x ${Z}\n`, "origin", "url").status, 0);
    // A new main on a remote that has nothing: every first-parent commit not on any remote ref counts.
    const fresh = cli(`refs/heads/main ${state} refs/heads/main ${Z}\n`, "origin", "url");
    assert.equal(fresh.status, 1);
    assert.match(fresh.stderr, /base.*a\.ts/);
    assert.equal(cli("", "--range", "nope..HEAD").status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
