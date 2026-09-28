// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Skills lint (AGENTIC_PRACTICES §3): a cheap, deterministic regression check on the project
// skills in .claude/skills/.
//   node tools/skills-lint.ts [--root <repo>] [--inbox-max-days <n>]
// ERRORS (exit 1): SKILL.md frontmatter missing or unparsable; `name` differs from the folder;
// description missing, over 1,024 characters, or without a trigger ("Use when/at/before/after/
// for ..."); SKILL.md over 150 lines;
// a relative Markdown link in any skill file that does not resolve.
// WARNINGS (exit 0): inbox lesson files older than N days (default 7, by last commit date);
// inbox bullets not tagged `- [skill]` or tagged with an unknown skill.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_LINES = 150;
export const MAX_DESCRIPTION = 1024;

export interface LintResult { errors: string[]; warnings: string[] }

function frontmatter(text: string): Record<string, string> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    else if (line.trim() && !/^\s/.test(line)) return null;
  }
  return out;
}

function links(text: string): string[] {
  const noCode = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...noCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(m => m[1])
    .filter(l => !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(l));
}

function mdFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? mdFiles(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : []);
}

export function lintSkills(root: string, opts: { inboxMaxDays?: number | undefined; now?: number } = {}): LintResult {
  const errors: string[] = [], warnings: string[] = [];
  const skillsDir = join(root, ".claude", "skills");
  const rel = (p: string) => p.slice(root.length + 1).replace(/\\/g, "/");
  const skills = readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith("_")).map(e => e.name);

  for (const name of skills) {
    const file = join(skillsDir, name, "SKILL.md");
    if (!existsSync(file)) { errors.push(`${rel(join(skillsDir, name))}: no SKILL.md`); continue; }
    const text = readFileSync(file, "utf8");
    const fm = frontmatter(text);
    if (!fm) { errors.push(`${rel(file)}: frontmatter missing or unparsable`); continue; }
    if (fm.name !== name) errors.push(`${rel(file)}: name "${fm.name ?? ""}" differs from folder "${name}"`);
    const d = fm.description ?? "";
    if (!d) errors.push(`${rel(file)}: description missing`);
    else {
      if (d.length > MAX_DESCRIPTION) errors.push(`${rel(file)}: description is ${d.length} chars (max ${MAX_DESCRIPTION})`);
      if (!/\bUse (when|whenever|at|before|after|for)\b/.test(d)) errors.push(`${rel(file)}: description lacks a trigger ("Use when/at/before/after/for ...")`);
    }
    const lines = text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
    if (lines > MAX_LINES) errors.push(`${rel(file)}: ${lines} lines (max ${MAX_LINES}; move detail to a sibling reference file)`);
  }

  for (const file of mdFiles(skillsDir)) {
    for (const l of links(readFileSync(file, "utf8"))) {
      const target = resolve(dirname(file), decodeURI(l.split("#")[0]));
      if (!existsSync(target)) errors.push(`${rel(file)}: broken link ${l}`);
    }
  }

  const inbox = join(skillsDir, "_inbox");
  if (existsSync(inbox)) {
    const maxDays = opts.inboxMaxDays ?? 7;
    const now = opts.now ?? Date.now();
    for (const f of readdirSync(inbox).filter(f => f.endsWith(".md") && f !== "README.md")) {
      const path = join(inbox, f);
      const r = spawnSync("git", ["log", "-1", "--format=%ct", "--", rel(path)], { cwd: root, encoding: "utf8" });
      const committed = r.status === 0 && r.stdout.trim() ? Number(r.stdout.trim()) * 1000 : statSync(path).mtimeMs;
      const days = Math.floor((now - committed) / 86_400_000);
      if (days > maxDays) warnings.push(`${rel(path)}: unfolded for ${days} days (fold after every wave)`);
      for (const line of readFileSync(path, "utf8").split(/\r?\n/).filter(l => /^\s*- /.test(l))) {
        const tag = /^\s*- \[([\w-]+)\]/.exec(line)?.[1];
        if (!tag) { if (!/^\s*- none\b/i.test(line)) warnings.push(`${rel(path)}: untagged lesson: ${line.trim().slice(0, 80)}`); }
        else if (!skills.includes(tag) && tag !== "CLAUDE.md" && tag !== "claude-md") warnings.push(`${rel(path)}: unknown skill tag [${tag}]`);
      }
    }
  }
  return { errors, warnings };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2);
  const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const root = resolve(arg("--root") ?? process.cwd());
  const r = lintSkills(root, { inboxMaxDays: arg("--inbox-max-days") ? Number(arg("--inbox-max-days")) : undefined });
  for (const w of r.warnings) process.stdout.write(`warning: ${w}\n`);
  for (const e of r.errors) process.stderr.write(`error: ${e}\n`);
  process.stdout.write(`skills-lint: ${r.errors.length} error(s), ${r.warnings.length} warning(s)\n`);
  process.exitCode = r.errors.length ? 1 : 0;
}
