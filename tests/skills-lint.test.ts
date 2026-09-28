// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// tools/skills-lint.ts: the project skills stay well-formed (frontmatter, name = folder,
// description with a "Use when/at/before…" trigger, ≤150 lines, links resolve); inbox
// staleness/tagging are warnings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { lintSkills } from "../tools/skills-lint.ts";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "cyc-skills-"));
  for (const [p, s] of Object.entries(files)) { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), s); }
  return root;
}
const skill = (name: string, desc = `Does a thing. Use when a thing is needed.`, body = "# X\n") => `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}`;

test("the repo's own skills pass the lint", () => {
  const r = lintSkills(process.cwd());
  assert.deepEqual(r.errors, []);
});

test("a well-formed skill with a resolving link passes; each defect is reported", () => {
  const good = fixture({
    ".claude/skills/cyc-a/SKILL.md": skill("cyc-a", undefined, "See [ref](ref.md#top) and [web](https://x.test) and `[not](a-link.md)`.\n"),
    ".claude/skills/cyc-a/ref.md": "# ref\n",
    ".claude/skills/_inbox/README.md": "readme with [a](../cyc-a/SKILL.md)\n",
  });
  try { assert.deepEqual(lintSkills(good), { errors: [], warnings: [] }); } finally { rmSync(good, { recursive: true, force: true }); }

  const bad = fixture({
    ".claude/skills/cyc-b/SKILL.md": skill("cyc-other"),
    ".claude/skills/cyc-c/SKILL.md": skill("cyc-c", "Does a thing with no trigger."),
    ".claude/skills/cyc-d/SKILL.md": skill("cyc-d", "Use when " + "x".repeat(1100)),
    ".claude/skills/cyc-e/SKILL.md": skill("cyc-e", undefined, "line\n".repeat(160)),
    ".claude/skills/cyc-f/SKILL.md": skill("cyc-f", undefined, "[gone](missing.md)\n"),
    ".claude/skills/cyc-g/SKILL.md": "# no frontmatter\n",
    ".claude/skills/cyc-h/notes.md": "no SKILL.md here\n",
  });
  try {
    const e = lintSkills(bad).errors.join("\n");
    assert.match(e, /cyc-b\/SKILL\.md: name "cyc-other" differs from folder "cyc-b"/);
    assert.match(e, /cyc-c\/SKILL\.md: description lacks a trigger/);
    assert.match(e, /cyc-d\/SKILL\.md: description is \d+ chars/);
    assert.match(e, /cyc-e\/SKILL\.md: 16\d lines \(max 150/);
    assert.match(e, /cyc-f\/SKILL\.md: broken link missing\.md/);
    assert.match(e, /cyc-g\/SKILL\.md: frontmatter missing/);
    assert.match(e, /cyc-h: no SKILL\.md/);
  } finally { rmSync(bad, { recursive: true, force: true }); }
});

test("inbox: stale files, untagged and unknown-tag lessons are warnings, not errors", () => {
  const root = fixture({
    ".claude/skills/cyc-a/SKILL.md": skill("cyc-a"),
    ".claude/skills/_inbox/worktree-agent-x.md": "- [cyc-a] Do it — evidence: t — scope: always\n- no tag here\n- [cyc-zzz] unknown\n",
    ".claude/skills/_inbox/worktree-agent-y.md": "- none\n",
  });
  try {
    // +30.5 days: file mtimes can land a few ms after Date.now() on Windows, so never test the exact edge.
    const r = lintSkills(root, { now: Date.now() + 30.5 * 86_400_000 });
    assert.deepEqual(r.errors, []);
    const w = r.warnings.join("\n");
    assert.match(w, /worktree-agent-x\.md: unfolded for 30 days/);
    assert.match(w, /untagged lesson: - no tag here/);
    assert.match(w, /unknown skill tag \[cyc-zzz\]/);
    assert.doesNotMatch(w, /untagged lesson: - none/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("CLI exits 1 on errors and 0 on warnings only", () => {
  const root = fixture({ ".claude/skills/cyc-a/SKILL.md": skill("cyc-b") });
  try {
    const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "tools/skills-lint.ts", "--root", root], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /differs from folder/);
    const ok = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "tools/skills-lint.ts"], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /skills-lint: 0 error\(s\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
