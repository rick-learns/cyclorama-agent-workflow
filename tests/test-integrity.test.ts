// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// tools/test-integrity.ts: the acceptance verifier's deterministic check that an agent branch did
// not get green by deleting, skipping or weakening tests, hand-editing expected hashes, or
// narrowing the test run. Unit cases on the core, then the CLI against a real temporary repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkIntegrity, countAsserts, countTests, type Change } from "../tools/test-integrity.ts";

const T2 = `import { test } from "node:test";\nimport assert from "node:assert/strict";\ntest("a", () => { assert.equal(f(), 1); assert.ok(g()); });\ntest("b", () => { assert.deepEqual(h(), [1]); });\n`;
const repo = (before: Record<string, string>, after: Record<string, string>) => ({ before: (p: string) => before[p] ?? null, after: (p: string) => after[p] ?? null });
const check = (changes: Change[], before: Record<string, string>, after: Record<string, string>) => checkIntegrity(changes, repo(before, after));

test("counters see test/it declarations and assertions, not look-alikes", () => {
  assert.equal(countTests(T2), 2);
  assert.equal(countAsserts(T2), 3);
  assert.equal(countTests(`it("x", f); test.skip("y", f); latest(1); t.test("z", f);`), 2);
  assert.equal(countAsserts(`expect(x).toBe(1); assert(y); assert.match(a, /b/); reassert(1);`), 3);
});

test("clean change: adding tests and assertions passes", () => {
  const after = T2 + `test("c", () => { assert.ok(1); });\n`;
  assert.deepEqual(check([{ status: "M", path: "tests/x.test.ts" }], { "tests/x.test.ts": T2 }, { "tests/x.test.ts": after }), []);
  assert.deepEqual(check([{ status: "A", path: "tests/new.test.ts" }], {}, { "tests/new.test.ts": T2 }), []);
});

test("deleted test file fails unless a DECISIONS line on the branch names it", () => {
  assert.match(check([{ status: "D", path: "tests/x.test.ts" }], { "tests/x.test.ts": T2 }, {}).join("\n"), /tests\/x\.test\.ts: test file deleted/);
  const dec = "- 2026-09-26 [verify] x.test.ts retired: superseded by y.test.ts\n";
  assert.deepEqual(check([{ status: "D", path: "tests/x.test.ts" }, { status: "M", path: "DECISIONS.md" }], { "tests/x.test.ts": T2, "DECISIONS.md": "" }, { "DECISIONS.md": dec }), []);
});

test("fewer tests or assertions fail; moving tests between files does not", () => {
  const one = `test("a", () => { assert.equal(f(), 1); assert.ok(g()); });\n`;
  assert.match(check([{ status: "M", path: "tests/x.test.ts" }], { "tests/x.test.ts": T2 }, { "tests/x.test.ts": one }).join("\n"), /test declarations dropped 2→1/);
  const weaker = T2.replace("assert.ok(g()); ", "");
  assert.match(check([{ status: "M", path: "tests/x.test.ts" }], { "tests/x.test.ts": T2 }, { "tests/x.test.ts": weaker }).join("\n"), /assertions dropped 3→2/);
  const rest = `test("b", () => { assert.deepEqual(h(), [1]); });\n`;
  assert.deepEqual(check(
    [{ status: "M", path: "tests/x.test.ts" }, { status: "A", path: "tests/browser/x2.test.ts" }],
    { "tests/x.test.ts": T2 }, { "tests/x.test.ts": one, "tests/browser/x2.test.ts": rest },
  ), []);
  assert.deepEqual(check([{ status: "R", oldPath: "tests/x.test.ts", path: "tests/browser/x.test.ts" }], { "tests/x.test.ts": T2 }, { "tests/browser/x.test.ts": T2 }), []);
  assert.match(check([{ status: "R", oldPath: "tests/x.test.ts", path: "tests/x.ts" }], { "tests/x.test.ts": T2 }, { "tests/x.ts": T2 }).join("\n"), /renamed to non-test path/);
});

test("added skip / only / todo fail; comments mentioning them do not", () => {
  for (const line of [`test.skip("c", () => {});`, `test.only("a", () => {});`, `test("c", { skip: true }, () => {});`, `it("d", { todo: "later" }, () => {});`, `describe.skip("s", () => {});`]) {
    const out = check([{ status: "M", path: "tests/x.test.ts" }], { "tests/x.test.ts": T2 }, { "tests/x.test.ts": T2 + line + "\n" });
    assert.match(out.join("\n"), /adds a skip\/only\/todo/, line);
  }
  assert.deepEqual(check([{ status: "M", path: "tests/x.test.ts" }], { "tests/x.test.ts": T2 }, { "tests/x.test.ts": T2 + "// no .skip( here; todo: nothing\n" }), []);
  // Fixture strings that merely contain the words are not skips (this repo's own tests do that).
  const fixtures = `test("fx", () => { assert.equal(n(\`test.skip("y", f);\`), 1); assert.ok(w("it.only(", 'skip: true')); });\n`;
  assert.deepEqual(check([{ status: "M", path: "tests/x.test.ts" }], { "tests/x.test.ts": T2 }, { "tests/x.test.ts": T2 + fixtures }), []);
});

test("expected hash changes need a ROM or toolchain source change in the same diff", () => {
  const pinned = (h: string) => `test("replay", () => { assert.equal(hash(), "${h}"); });\n`;
  const t: Change = { status: "M", path: "tests/replay.test.ts" };
  const before = { "tests/replay.test.ts": pinned("df9e9aef") };
  const after = { "tests/replay.test.ts": pinned("0badc0de") };
  assert.match(check([t], before, after).join("\n"), /expected hash\/replay changed with no ROM/);
  assert.deepEqual(check([t, { status: "M", path: "roms/shadeworks/shadeworks.asm" }], before, after), []);
  assert.deepEqual(check([t, { status: "M", path: "src/scrim/codegen.ts" }], before, after), []);
  assert.match(check([{ status: "M", path: "replays/shadeworks.replay.json" }], {}, {}).join("\n"), /replays\/shadeworks\.replay\.json: expected hash/);
  assert.match(check([{ status: "M", path: "roms/manifest.json" }], {}, {}).join("\n"), /roms\/manifest\.json/);
  assert.deepEqual(check([{ status: "A", path: "replays/newgame.replay.json" }, { status: "A", path: "roms/newgame/newgame.scr" }], {}, {}), []);
  assert.deepEqual(check([{ status: "M", path: "roms/manifest.json" }, { status: "A", path: "roms/newgame/newgame.scr" }], {}, {}), []);
});

test("narrowing the gate's test run fails", () => {
  const pkgBefore = `{"scripts":{"test":"node --test \\"tests/**/*.test.ts\\""}}`;
  const pkgAfter = `{"scripts":{"test":"node --test --test-name-pattern=fast \\"tests/**/*.test.ts\\""}}`;
  assert.match(check([{ status: "M", path: "package.json" }], { "package.json": pkgBefore }, { "package.json": pkgAfter }).join("\n"), /narrows the test run/);
  assert.match(check([{ status: "M", path: "tools/verify.ts" }], { "tools/verify.ts": "" }, { "tools/verify.ts": `args.push("--test-skip-pattern", "browser");` }).join("\n"), /narrows/);
  assert.deepEqual(check([{ status: "M", path: "tools/verify.ts" }], { "tools/verify.ts": "" }, { "tools/verify.ts": `args.push("--test-concurrency=4");` }), []);
});

test("CLI: compares the branch with its merge-base, exit 1 with findings, 0 when clean, 2 on bad refs", () => {
  const dir = mkdtempSync(join(tmpdir(), "cyc-integrity-"));
  const git = (...a: string[]) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "core.hooksPath=", ...a], { cwd: dir, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  const write = (p: string, s: string) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  const cli = (...a: string[]) => spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(process.cwd(), "tools", "test-integrity.ts"), ...a], { cwd: dir, encoding: "utf8" });
  try {
    git("init", "-q", "-b", "main");
    write("tests/x.test.ts", T2);
    write("tests/y.test.ts", T2);
    git("add", "tests");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "good");
    write("tests/z.test.ts", T2);
    git("add", "tests/z.test.ts");
    git("commit", "-q", "-m", "more tests");
    git("checkout", "-q", "main");
    unlinkSync(join(dir, "tests", "y.test.ts")); // main moves on after the branch point: must not count
    git("add", "tests/y.test.ts");
    git("commit", "-q", "-m", "main drops y");
    git("checkout", "-q", "-b", "bad", "good");
    write("tests/x.test.ts", T2 + `test.skip("later", () => {});\n`);
    git("add", "tests/x.test.ts");
    git("commit", "-q", "-m", "skip");

    const ok = cli("main", "good");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /OK: no deleted/);
    const bad = cli("main...bad");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /tests\/x\.test\.ts: adds a skip/);
    assert.doesNotMatch(bad.stderr, /y\.test\.ts/);
    assert.equal(cli("main", "no-such-branch").status, 2);
    assert.equal(cli().status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
