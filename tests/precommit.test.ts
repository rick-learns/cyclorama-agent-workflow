// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// tools/precommit.ts (run by .githooks/pre-commit): staged-file policy and a small secret scan.
// Secret scanning / push protection are not available for private personal repos on GitHub Free,
// so this local scan is the only line of defence before a token reaches the remote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStagedFiles, scanAddedLines, parseAddedLines, MAX_FILE_BYTES } from "../tools/precommit.ts";

// Built by concatenation so this file never contains a literal token.
const fake = {
  ghp: "ghp" + "_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
  pat: "github" + "_pat_" + "11ABCDEFG0" + "x".repeat(72),
  aws: "AKIA" + "IOSFODNN7EXAMPLE",
  key: "-----BEGIN " + "OPENSSH PRIVATE KEY-----",
  npm: "npm" + "_" + "abcdefghijklmnopqrstuvwxyz0123456789",
  ant: "sk-ant-" + "api03-" + "Z".repeat(40),
  slack: "xox" + "b-1234567890-abcdefghij",
  google: "AIza" + "SyA1234567890abcdefghijklmnopqrstuv",
  cloudflare: "CLOUDFLARE_API_TOKEN=" + "C".repeat(40),
};

test("normal staged files pass", () => {
  assert.deepEqual(checkStagedFiles([
    { path: "src/machine/cpu.ts", size: 40_000 }, { path: "docs/manual/index.html", size: 410_000 },
    { path: "research/reference/erg-zones.webp", size: 494_000 }, { path: ".env.example", size: 100 },
  ]), []);
});

test("WAV files, oversized files and secret-bearing file names are rejected", () => {
  const problems = checkStagedFiles([
    { path: "roms/sound-test/theme.wav", size: 10_000 },
    { path: "research/big.png", size: MAX_FILE_BYTES + 1 },
    { path: ".env", size: 10 }, { path: "config/.env.local", size: 10 },
    { path: "keys/deploy.pem", size: 10 }, { path: "id_ed25519", size: 10 },
  ]);
  assert.equal(problems.length, 6, problems.join("\n"));
});

test("high-confidence secrets in added lines are found; ordinary text is not", () => {
  const lines = Object.values(fake).map((text, i) => ({ file: "x.ts", line: i + 1, text: `const t = "${text}";` }));
  assert.equal(scanAddedLines(lines).length, lines.length);
  const clean = [
    "const re = /ghp_[A-Za-z0-9]{36}/;", "the AKIA prefix marks AWS keys", "-----BEGIN PUBLIC KEY-----",
    "sk-ant- is Anthropic's prefix", "npm_config_cache=/tmp", "SHA 3d3c42e5aac5ba805825da76410c181273ba90b1",
    "printf 'CLOUDFLARE_API_TOKEN=%s' \"$T\"", "env: { CLOUDFLARE_API_TOKEN: token }",
  ].map((text, i) => ({ file: "doc.md", line: i + 1, text }));
  assert.deepEqual(scanAddedLines(clean), []);
});

test("added lines are parsed from a zero-context staged diff", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts", "index 1..2 100644", "--- a/a.ts", "+++ b/a.ts", "@@ -1,0 +3,2 @@",
    "+first", "+second", "diff --git a/b.md b/b.md", "--- a/b.md", "+++ b/b.md", "@@ -5 +5 @@", "-old", "+new",
    "diff --git a/gone.ts b/gone.ts", "--- a/gone.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-bye",
  ].join("\n");
  assert.deepEqual(parseAddedLines(diff), [
    { file: "a.ts", line: 3, text: "first" }, { file: "a.ts", line: 4, text: "second" }, { file: "b.md", line: 5, text: "new" },
  ]);
});
