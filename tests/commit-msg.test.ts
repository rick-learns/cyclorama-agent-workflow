// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// tools/commit-msg.ts: Conventional Commits 1.0 headers plus the project's trailers
// (owner decision 2026-09-26; CONTRIBUTING.md "Branches and commit messages").
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCommitMessage, cleanMessage, hasObservedResult, COMMIT_TYPES, MAX_HEADER, POLICY_START } from "../tools/commit-msg.ts";

const CO = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
const msg = (...lines: string[]) => lines.join("\n") + "\n";

test("valid conventional messages pass", () => {
  const ok = [
    msg("feat(site): add the branch preview banner", "", "Verified: site.test.ts 12/12 pass", CO),
    msg("fix: stop the slot lock leaking on crash", "", "Longer evidence goes in the body.", "", "Milestone: M5", "Verified: slot.test.ts 9/9 pass", CO),
    msg("docs: describe branches in CONTRIBUTING"),
    msg("test(commit-msg): pin the scissors cleanup", "", CO),
    msg("perf(cpu)!: decode opcodes from a flat table", "", "Verified: bench 1.8x faster, cpu.test.ts 41/41", "BREAKING CHANGE: the old decoder export is gone"),
    msg("canon: register the 1989 holiday bundle", "", "Verified: canon zero contradictions, canon.test.ts ok"),
    msg("ci: run the commit checker on pull requests"),
    msg("build(roms): regenerate the manifest"),
    msg("refactor(scrim-codegen): split the emitter"),
    msg("chore: fold inbox lessons"),
    msg("revert: undo the tile cache", "", "This reverts commit 4dba17e."),
    msg("feat(erg): add the dawn stage", "", "Verified: replay hash f3aa5734"),
    msg("fix: keep the guard green", "", "Verified: verify green"),
  ];
  for (const m of ok) assert.deepEqual(checkCommitMessage(m), [], m);
  assert.deepEqual([...COMMIT_TYPES].sort(), ["build", "canon", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "test"]);
});

test("real old-style subjects from git log are rejected", () => {
  const old = [
    "Release: npm run deploy — production only from a clean main equal to origin/main, previews from other branches; deploy-site.test.ts 5/5, site.test.ts 12/12",
    "STATE: next action reflects the owner's deploy authorization and branch previews",
    "M4: ERG: NIGHTSIDE RUN accepted (Avenell Playhouse pack-in, 1987-09-18, SCRIM platformer)",
    "Process: the MacBook lead is the integrator (pushes main); other machines push branches; production deploys only verified main commits",
  ];
  for (const s of old) assert.ok(checkCommitMessage(msg(s, "", CO)).length > 0, s);
  assert.match(checkCommitMessage(msg("Fix: stop the leak")).join("\n"), /lowercase/);
  assert.match(checkCommitMessage(msg("feature: add a thing")).join("\n"), /unknown type 'feature'/);
});

test("header shape: scope kebab-case, summary imperative without a period, at most 100 characters", () => {
  assert.match(checkCommitMessage(msg("docs(Site_Map): describe it")).join("\n"), /scope/);
  assert.match(checkCommitMessage(msg("docs(): describe it")).join("\n"), /scope/);
  assert.match(checkCommitMessage(msg("docs: describe the branches.")).join("\n"), /period/);
  assert.match(checkCommitMessage(msg("docs:describe it")).join("\n"), /type\(scope\)!: summary/);
  assert.match(checkCommitMessage(msg("docs:  describe it")).join("\n"), /type\(scope\)!: summary/);
  assert.match(checkCommitMessage(msg("docs: ")).join("\n"), /type\(scope\)!: summary/);
  for (const s of ["docs: added the branch section", "docs: adds the branch section", "docs: adding the branch section", "fix: Fixed the leak"]) {
    assert.match(checkCommitMessage(msg(s)).join("\n"), /imperative/, s);
  }
  for (const s of ["docs: embed the SPDX header", "refactor: speed up the decoder", "chore: bring the site onto main", "docs: seed the example", "docs: `thing` names in the glossary"]) {
    assert.deepEqual(checkCommitMessage(msg(s)), [], s);
  }
  const long = "docs: " + "x".repeat(MAX_HEADER - 6 + 1);
  assert.equal(long.length, MAX_HEADER + 1);
  assert.match(checkCommitMessage(msg(long)).join("\n"), /101 characters.*100/);
  assert.deepEqual(checkCommitMessage(msg("docs: " + "x".repeat(MAX_HEADER - 6))), []);
  assert.match(checkCommitMessage(msg("docs: describe it", "body without the blank line")).join("\n"), /blank line/);
  assert.match(checkCommitMessage("\n\n").join("\n"), /empty/);
});

test("git-generated subjects are exempt: Merge, Revert, fixup!/squash!/amend!", () => {
  for (const s of [
    "Merge branch 'feat/branch-policy'", "Merge remote-tracking branch 'origin/main' into mac/ci-review",
    "Merge pull request #12 from rick-learns/fix/x", "Revert \"feat(site): add the banner\"",
    "fixup! feat(site): add the banner", "squash! Release: old style", "amend! fix: keep it",
  ]) assert.deepEqual(checkCommitMessage(msg(s, "", "Landed: anything goes in the body")), [], s);
});

test("Verified trailer: required for feat, fix, perf and canon, and must state an observed result", () => {
  for (const t of ["feat", "fix", "perf", "canon"]) {
    assert.match(checkCommitMessage(msg(`${t}: add the thing`, "", CO)).join("\n"), /Verified:/, t);
  }
  for (const t of ["docs", "test", "ci", "build", "refactor", "chore", "revert"]) {
    assert.deepEqual(checkCommitMessage(msg(`${t}: add the thing`, "", CO)), [], t);
  }
  const commandOnly = [
    "node --test tests/site.test.ts",
    "npm run verify",
    "node tools/slot.ts 2 -- node tools/verify.ts --allow-dirty",
    "`node --test --test-concurrency=4 tests/commit-msg.test.ts`",
    "see body",
  ];
  for (const v of commandOnly) {
    assert.match(checkCommitMessage(msg("feat: add the thing", "", `Verified: ${v}`, CO)).join("\n"), /observed result/, v);
    assert.equal(hasObservedResult(v), false, v);
  }
  for (const v of [
    "site.test.ts 12/12 pass", "node --test tests/site.test.ts → 12/12 pass", "npm run verify: exit 0",
    "replay f3aa5734 (10,162 frames)", "verify green", "commit-msg.test.ts 14/14", "`node tools/verify.ts` ok",
    "tests pass",
  ]) assert.equal(hasObservedResult(v), true, v);
  // The trailer must be in the trailer block (the last paragraph), and not empty.
  assert.match(checkCommitMessage(msg("fix: stop the leak", "", "Verified: slot.test.ts 9/9", "", "More words after it.")).join("\n"), /last paragraph/);
  assert.match(checkCommitMessage(msg("fix: stop the leak", "", "Verified:", CO)).join("\n"), /observed result|empty/);
});

test("other trailers: Milestone is M<n>, BREAKING CHANGE needs a description", () => {
  assert.deepEqual(checkCommitMessage(msg("docs: describe it", "", "Milestone: M5", CO)), []);
  assert.match(checkCommitMessage(msg("docs: describe it", "", "Milestone: five", CO)).join("\n"), /Milestone/);
  assert.match(checkCommitMessage(msg("docs!: describe it", "", "BREAKING CHANGE:", CO)).join("\n"), /BREAKING CHANGE/);
  assert.deepEqual(checkCommitMessage(msg("docs: describe it", "", "BREAKING-CHANGE: the old anchor is gone", CO)), []);
});

test("cleanMessage strips comment lines and the scissors section like git's default cleanup", () => {
  const raw = [
    "docs: describe it", "# Please enter the commit message", "", "Body.", "#comment", "",
    "# ------------------------ >8 ------------------------", "# Do not modify or remove the line above.",
    "diff --git a/x b/x", "+Release: not a message line",
  ].join("\n");
  assert.equal(cleanMessage(raw), "docs: describe it\n\nBody.\n");
  assert.equal(cleanMessage("; custom\nfix: x\n", ";"), "fix: x\n");
});

test("CLI: message-file mode (commit-msg hook) and --range mode over a real repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "cyc-commit-msg-"));
  const tool = join(process.cwd(), "tools", "commit-msg.ts");
  const cli = (...a: string[]) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", tool, ...a], { cwd: dir, encoding: "utf8" });
  const git = (...a: string[]) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    writeFileSync(join(dir, "good.txt"), "docs: describe it\n# comment line\n");
    writeFileSync(join(dir, "bad.txt"), "Release: old style\n");
    const good = cli("good.txt");
    assert.equal(good.status, 0, good.stderr);
    const bad = cli("bad.txt");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /commit-msg: .*Release: old style/s);

    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "base");
    const base = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "feat/x");
    git("commit", "-q", "--allow-empty", "-m", "docs: describe the thing");
    git("checkout", "-q", "main");
    git("commit", "-q", "--allow-empty", "-m", "chore: tidy");
    git("merge", "-q", "--no-ff", "--no-edit", "feat/x");
    const clean = cli("--range", `${base}..HEAD`);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /2 commits/);
    git("commit", "-q", "--allow-empty", "-m", "Release: an old-style subject");
    const dirty = cli("--range", `${base}..HEAD`);
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /Release: an old-style subject/);
    assert.equal(cli("--range", "nope..HEAD").status, 2);
    assert.equal(cli().status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--range skips (and reports) commits committed before POLICY_START: history nobody can rewrite never fails CI", () => {
  assert.equal(POLICY_START, "2026-09-26T19:14:17-05:00", "the committer date of cd18730, the merge that introduced tools/commit-msg.ts");
  const dir = mkdtempSync(join(tmpdir(), "cyc-commit-msg-"));
  const tool = join(process.cwd(), "tools", "commit-msg.ts");
  const cli = (...a: string[]) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", tool, ...a], { cwd: dir, encoding: "utf8" });
  const git = (date: string | null, ...a: string[]) => {
    const env = { ...process.env, ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}) };
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd: dir, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  try {
    git(null, "init", "-q", "-b", "main");
    git(null, "commit", "-q", "--allow-empty", "-m", "base");
    const base = git(null, "rev-parse", "HEAD");
    // A side branch cut before the policy, merged after it (the perf/emulation-dedup case, run 36284293889).
    git(null, "checkout", "-q", "-b", "perf/old");
    git("2026-09-26T17:59:00-05:00", "commit", "-q", "--allow-empty", "-m", "CI speed: a pre-policy subject far longer than the header limit allows, with no type at all, written before the rules");
    git("2026-09-26T18:24:10-05:00", "commit", "-q", "--allow-empty", "-m", "wip(perf): a pre-policy rescue commit");
    git(null, "commit", "-q", "--allow-empty", "-m", "perf(machine): a post-policy commit\n\nVerified: fixture → ok");
    git(null, "checkout", "-q", "main");
    git(null, "merge", "-q", "--no-ff", "--no-edit", "perf/old");
    const ok = cli("--range", `${base}..HEAD`);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /skipped 2 pre-policy commits/);
    assert.match(ok.stdout, /1 commits? in .* follow/);
    // A bad commit made after POLICY_START still fails.
    git(null, "commit", "-q", "--allow-empty", "-m", "wip: after the policy");
    const bad = cli("--range", `${base}..HEAD`);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /wip: after the policy/);
    assert.doesNotMatch(bad.stderr, /CI speed/, "pre-policy commits are never reported as findings");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
