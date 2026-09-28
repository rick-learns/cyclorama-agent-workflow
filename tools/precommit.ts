// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Fast pre-commit checks, run by .githooks/pre-commit once a clone opts in with
//   git config core.hooksPath .githooks
// 1. staged-file policy: no WAV renders (they belong in .tmp/), no file over MAX_FILE_BYTES,
//    no secret-bearing file names (.env, *.pem, private SSH keys);
// 2. secret scan of the staged added lines (GitHub secret scanning and push protection are not
//    available for private personal repos on GitHub Free, so this is the only check before push);
// 3. typecheck and canon validation (about 4 s). The full gate stays `npm run verify`.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface StagedFile { path: string; size: number }
export interface AddedLine { file: string; line: number; text: string }

export function checkStagedFiles(files: StagedFile[]): string[] {
  const problems: string[] = [];
  for (const { path, size } of files) {
    const name = path.split("/").pop()!;
    if (/\.wav$/i.test(name)) problems.push(`${path}: WAV renders stay in .tmp/ (not committed)`);
    if (size > MAX_FILE_BYTES) problems.push(`${path}: ${(size / 1048576).toFixed(1)} MiB exceeds the ${MAX_FILE_BYTES / 1048576} MiB per-file limit`);
    if ((/^\.env(\..+)?$/.test(name) && name !== ".env.example") || /\.(pem|key|p12|pfx)$/i.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) {
      problems.push(`${path}: looks like a secrets file; never commit it`);
    }
  }
  return problems;
}

// High-confidence token shapes only, so false positives stay rare.
const SECRET_PATTERNS: [string, RegExp][] = [
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36}\b/],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ["AWS access key id", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private key", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{32,}/],
  ["OpenAI API key", /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{40,}/],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Cloudflare API token", /\bCLOUDFLARE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{20,}/],
];

export function scanAddedLines(lines: AddedLine[]): string[] {
  const hits: string[] = [];
  for (const { file, line, text } of lines) {
    for (const [what, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${file}:${line}: possible ${what}`);
  }
  return hits;
}

/** Added lines (with new-file line numbers) from `git diff --cached -U0`. */
export function parseAddedLines(diff: string): AddedLine[] {
  const out: AddedLine[] = [];
  let file: string | null = null, n = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) { file = l === "+++ /dev/null" ? null : l.slice(4).replace(/^b\//, ""); continue; }
    if (l.startsWith("--- ") || l.startsWith("diff --git")) continue;
    const h = /^@@ -\S+ \+(\d+)/.exec(l);
    if (h) { n = Number(h[1]); continue; }
    if (file && l.startsWith("+")) out.push({ file, line: n++, text: l.slice(1) });
  }
  return out;
}

function git(args: string[], input?: string): string {
  const r = spawnSync("git", args, { encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function main(): number {
  const paths = git(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]).split("\0").filter(Boolean);
  const sizes = paths.length ? git(["cat-file", "--batch-check=%(objectsize)"], paths.map(p => `:${p}`).join("\n") + "\n").trim().split("\n") : [];
  const problems = [
    ...checkStagedFiles(paths.map((path, i) => ({ path, size: Number(sizes[i]) || 0 }))),
    ...scanAddedLines(parseAddedLines(git(["diff", "--cached", "-U0", "--no-color", "--no-ext-diff", "--diff-filter=ACMR"]))),
  ];
  const node = [process.execPath, "--disable-warning=ExperimentalWarning"];
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  for (const [label, cmd] of [["typecheck", [process.execPath, tsc, "-p", "tsconfig.json", "--noEmit"]], ["canon", [...node, "tools/canon-check.ts"]]] as const) {
    const r = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8" });
    if (r.status !== 0) problems.push(`${label} failed:\n${(r.stdout + r.stderr).trim().split("\n").slice(0, 20).join("\n")}`);
  }
  if (!problems.length) return 0;
  console.error(`pre-commit: commit blocked\n  ${problems.join("\n  ")}\nFix these and commit again (full gate: npm run verify).`);
  return 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exit(main());
