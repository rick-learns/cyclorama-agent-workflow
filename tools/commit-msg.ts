// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Commit-message policy (owner decision 2026-09-26; CONTRIBUTING.md "Branches and commit messages"):
// Conventional Commits 1.0 headers plus the project's trailers.
//   node tools/commit-msg.ts <message-file>      commit-msg hook (.githooks/commit-msg): strips `#`
//                                                comment lines and the scissors section first
//   node tools/commit-msg.ts --range <a>..<b>    every non-merge commit in the range (CI reuse)
// Rules checked by checkCommitMessage (pure; returns the errors, [] = valid):
//   header `type(scope)!: summary`, type in COMMIT_TYPES (lowercase), scope optional kebab-case,
//   summary imperative with no trailing period, header at most MAX_HEADER characters, a blank line
//   before any body; git-generated subjects ("Merge …", "Revert …", "fixup!/squash!/amend! …")
//   are exempt. Trailers live in the last paragraph: `Verified: <observed result>` is required for
//   feat, fix, perf and canon; `Milestone: M<n>` is optional; `BREAKING CHANGE:` needs a text.
// Exit 0 = valid, 1 = findings (listed on stderr), 2 = usage or git error. No network.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const COMMIT_TYPES: ReadonlySet<string> = new Set(["feat", "fix", "test", "docs", "ci", "build", "perf", "refactor", "chore", "canon", "revert"]);
/** Types whose commits must carry a `Verified:` trailer with an observed result. */
export const VERIFIED_TYPES: ReadonlySet<string> = new Set(["feat", "fix", "perf", "canon"]);
export const MAX_HEADER = 100;
/** When the policy took effect: the committer date of cd18730, the merge that introduced this
 *  tool. `--range` skips (and reports) commits committed earlier, because a branch cut before the
 *  policy and merged after it brings history nobody can rewrite on main (run 36284293889). */
export const POLICY_START = "2026-09-26T19:14:17-05:00";

const EXEMPT = /^(Merge |Revert |(fixup|squash|amend)! )/;
const HEADER = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^()]*)\))?(?<bang>!)?: (?<summary>\S.*)$/;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRAILER = /^(?<key>BREAKING CHANGE|[A-Za-z][A-Za-z0-9-]*):(?:\s(?<value>.*))?$/;

// Imperative-mood heuristic on the summary's first word ("add", not "added"/"adds"/"adding").
const THIRD_PERSON = new Set(["adds", "fixes", "updates", "removes", "makes", "moves", "changes", "improves",
  "implements", "creates", "bumps", "renames", "refactors", "deletes", "introduces", "merges", "allows",
  "ensures", "replaces", "supports", "handles", "uses", "cleans", "prevents", "enables", "disables", "sets"]);
const ED_OK = new Set(["embed", "shed", "shred", "bed", "red", "wed", "bred", "fled"]);
const ING_OK = new Set(["bring", "string", "spring", "swing", "sting", "cling", "fling", "sling", "wring", "ping", "ring", "sing", "thing", "king", "wing"]);
function imperative(word: string): boolean {
  const w = word.toLowerCase();
  if (THIRD_PERSON.has(w)) return false;
  if (/^[a-z]+ed$/.test(w) && !w.endsWith("eed") && !ED_OK.has(w)) return false;
  if (/^[a-z]+ing$/.test(w) && !ING_OK.has(w)) return false;
  return true;
}

const COMMAND = /^(?:node|npm|npx|git|tsc|bash|sh|pwsh|powershell|yarn|pnpm|deno|bun|make)\b/;
const SEPARATOR = /\s*(?:→|->|=>|:|—|–|,|;|\()\s*/;
/**
 * Whether a `Verified:` value states an observed result rather than only the command that was run:
 * a pass/ok/green word anywhere, or a number or hash outside the command itself (backticked spans,
 * flags and file paths never count; a value that starts with a command counts numbers only after a
 * separator such as `→`, `:`, `—`, `,` or `(`).
 */
export function hasObservedResult(value: string): boolean {
  const words = (s: string) => s.replace(/`[^`]*`/g, " ").split(/\s+/)
    .filter(t => t && !t.startsWith("-") && !/[A-Za-z].*[/.]|[/.].*[A-Za-z]/.test(t)).join(" ");
  const v = value.trim();
  if (/\b(?:pass(?:es|ed)?|ok|green)\b/i.test(words(v))) return true;
  let rest = v.replace(/^`[^`]*`/, " ");
  if (COMMAND.test(rest.trim())) {
    const sep = SEPARATOR.exec(rest);
    rest = sep ? rest.slice(sep.index + sep[0].length) : "";
  }
  return /\d|\b[0-9a-f]{7,40}\b/i.test(words(rest));
}

/** git's default cleanup: drop `<commentChar>` lines and everything from the scissors line on. */
export function cleanMessage(raw: string, commentChar = "#"): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex(l => l === `${commentChar} ------------------------ >8 ------------------------`);
  const kept = (cut < 0 ? lines : lines.slice(0, cut)).filter(l => !l.startsWith(commentChar)).map(l => l.replace(/\s+$/, ""));
  const text = kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "");
  return text ? text + "\n" : "";
}

/** The errors in one commit message (already cleaned of comments); [] when it follows the policy. */
export function checkCommitMessage(message: string): string[] {
  const lines = message.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const header = lines[0] ?? "";
  if (!header.trim()) return ["the message is empty"];
  if (EXEMPT.test(header)) return [];
  const errors: string[] = [];
  if (header.length > MAX_HEADER) errors.push(`the header is ${header.length} characters; the limit is ${MAX_HEADER}`);
  const m = HEADER.exec(header);
  if (!m?.groups) {
    errors.push(`the header must read \`type(scope)!: summary\` (type one of ${[...COMMIT_TYPES].join(", ")}; one space after the colon), e.g. \`fix(site): stop the preview leaking\``);
    return errors;
  }
  const { type, scope, summary } = m.groups;
  if (!COMMIT_TYPES.has(type.toLowerCase())) errors.push(`unknown type '${type}' (use ${[...COMMIT_TYPES].join(", ")})`);
  else if (type !== type.toLowerCase()) errors.push(`the type must be lowercase ('${type.toLowerCase()}', not '${type}')`);
  if (scope !== undefined && !KEBAB.test(scope)) errors.push(`the scope '${scope}' must be kebab-case (lowercase letters, digits, hyphens), or leave it out`);
  if (/\.$/.test(summary)) errors.push("the summary ends with a period; drop it");
  const first = summary.split(/\s+/)[0].replace(/[^A-Za-z]/g, "");
  if (!imperative(first)) errors.push(`the summary should be imperative ('add', not '${first}')`);
  if (lines.length > 1 && lines[1].trim() !== "") errors.push("leave a blank line between the header and the body");

  // Trailer block = the last paragraph, when every line in it is `Token: value` (or a continuation).
  const paragraphs = lines.slice(1).join("\n").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const last = paragraphs.length ? paragraphs[paragraphs.length - 1].split("\n") : [];
  const isBlock = last.length > 0 && TRAILER.test(last[0]) && last.every(l => TRAILER.test(l) || /^\s/.test(l));
  const trailers = isBlock ? last.filter(l => TRAILER.test(l)).map(l => TRAILER.exec(l)!.groups!) : [];
  const get = (key: string) => trailers.filter(t => t.key.toLowerCase() === key.toLowerCase()).map(t => (t.value ?? "").trim());

  const verified = get("Verified");
  const strayVerified = lines.slice(1).some(l => /^Verified:/i.test(l)) && verified.length === 0;
  if (strayVerified) errors.push("the `Verified:` trailer must be in the trailer block (the last paragraph, with Co-Authored-By)");
  else if (VERIFIED_TYPES.has(type.toLowerCase()) && verified.length === 0) {
    errors.push(`${type} commits need a \`Verified: <observed result>\` trailer in the last paragraph, e.g. \`Verified: site.test.ts 12/12 pass\``);
  }
  for (const v of verified) {
    if (!hasObservedResult(v)) errors.push(`\`Verified: ${v}\` names no observed result (empty or command only); state what you saw, e.g. \`commit-msg.test.ts 8/8 pass\` or a hash`);
  }
  for (const v of get("Milestone")) if (!/^M\d+$/.test(v)) errors.push(`\`Milestone: ${v}\` must be M<n>, e.g. \`Milestone: M5\``);
  for (const v of [...get("BREAKING CHANGE"), ...get("BREAKING-CHANGE")]) if (!v) errors.push("`BREAKING CHANGE:` needs a description of what breaks");
  return errors;
}

function git(args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

function main(argv: string[]): number {
  if (argv[0] === "--range" && argv[1]) {
    const list = git(["rev-list", "--no-merges", "--reverse", argv[1]]);
    if (!list.ok) { console.error(`commit-msg: git rev-list ${argv[1]} failed: ${list.err.trim()}`); return 2; }
    const all = list.out.split("\n").filter(Boolean);
    const start = Date.parse(POLICY_START) / 1000;
    const shas: string[] = [];
    for (const sha of all) {
      const ct = git(["log", "-1", "--format=%ct", sha]);
      if (!ct.ok) { console.error(`commit-msg: git log ${sha} failed: ${ct.err.trim()}`); return 2; }
      if (Number(ct.out.trim()) >= start) shas.push(sha);
    }
    const skipped = all.length - shas.length;
    if (skipped) console.log(`commit-msg: skipped ${skipped} pre-policy commits (committed before ${POLICY_START})`);
    const findings: string[] = [];
    for (const sha of shas) {
      const body = git(["log", "-1", "--format=%B", sha]);
      if (!body.ok) { console.error(`commit-msg: git log ${sha} failed: ${body.err.trim()}`); return 2; }
      const errs = checkCommitMessage(body.out);
      if (errs.length) findings.push(`${sha.slice(0, 8)} ${body.out.split("\n")[0]}\n    ${errs.join("\n    ")}`);
    }
    if (findings.length) {
      console.error(`commit-msg: ${findings.length} of ${shas.length} commits in ${argv[1]} break the message policy (CONTRIBUTING.md "Branches and commit messages"):\n  ${findings.join("\n  ")}`);
      return 1;
    }
    console.log(`commit-msg: ${shas.length} commits in ${argv[1]} follow the message policy`);
    return 0;
  }
  if (argv.length !== 1 || argv[0].startsWith("-")) {
    console.error("usage: node tools/commit-msg.ts <message-file> | --range <a>..<b>");
    return 2;
  }
  let raw: string;
  try { raw = readFileSync(argv[0], "utf8"); } catch (e) { console.error(`commit-msg: ${(e as Error).message}`); return 2; }
  const cc = git(["config", "--get", "core.commentChar"]).out.trim();
  const message = cleanMessage(raw, cc && cc !== "auto" ? cc : "#");
  if (!message) return 0; // git itself aborts an empty message
  const errs = checkCommitMessage(message);
  if (!errs.length) return 0;
  console.error(`commit-msg: commit blocked — "${message.split("\n")[0]}"\n  ${errs.join("\n  ")}\n` +
    "Format: type(scope)!: summary  (CONTRIBUTING.md \"Branches and commit messages\"). Your message is kept in .git/COMMIT_EDITMSG.");
  return 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
