// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// SessionStart hook (startup|resume|clear|compact): prints a short orientation block that Claude
// Code adds to the lead's context: STATE.md's milestone, blockers, owner decisions, agents in
// flight and the single Next action; stop files; unmerged agent branches; uncommitted paths;
// unfolded inbox lessons. After a compaction this restores the mission state the summary may have
// dropped. Plain stdout = context (hooks docs). Context only: it cannot block anything, and any
// failure just prints less. Output stays well under the 10,000-character context cap.
//
// It also records the session start for the integrator's shared checkout and applies the checkout
// lock's claim rule (tools/checkout-lock.ts): {session, pid, branch, time} go to
// .git/cyc-checkout-lock.json, and the first line says whether this session is the integrator or
// must work in its own `git worktree add` folder. Only harness session ids (UUIDs) are recorded.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { recordSessionStart } from "../checkout-lock.ts";
import { git, projectDir, readHookInput } from "./hook-io.ts";

export const MAX_CHARS = 6000;

/** The body of a `## <heading>` section (up to the next `## `), trimmed. */
export function section(md: string, heading: string): string {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith(`## ${heading}`));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

export function orientation(root: string): string {
  const out: string[] = ["[cyc] Session orientation (SessionStart hook; source of truth is STATE.md)"];
  try {
    const state = readFileSync(join(root, "STATE.md"), "utf8");
    const milestone = /^## Current milestone:(.*)$/m.exec(state)?.[1]?.trim();
    if (milestone) out.push(`Milestone: ${milestone}`);
    const blockers = section(state, "Blockers");
    if (blockers && !/^none\.?$/i.test(blockers)) out.push(`Blockers: ${blockers.replace(/\s+/g, " ").slice(0, 400)}`);
    const decisions = section(state, "Decisions for the owner").split("\n").filter(l => /^- \[D-/.test(l));
    if (decisions.length) {
      out.push(`Decisions for the owner (${decisions.length}; ask at most 3 per wave summary):`);
      out.push(...decisions.slice(0, 6).map(l => l.slice(0, 360)));
    }
    const inflight = section(state, "In flight");
    if (inflight) out.push(`In flight (per STATE.md):\n${inflight.split("\n").slice(0, 8).join("\n")}`);
    out.push(`Next action: ${section(state, "Next action").replace(/\s+/g, " ").slice(0, 600) || "(missing: STATE.md must have exactly one)"}`);
  } catch {
    out.push("STATE.md not readable from the project dir.");
  }

  for (const f of ["HALT.md", "PLAYTEST_REQUEST.md", "PLAYTEST_APPROVED.md"]) {
    if (existsSync(join(root, f))) out.push(`STOP FILE PRESENT: ${f} (skill cyc-iteration §1 / cyc-playtest-checkpoint)`);
  }

  const unmerged = git(["branch", "--list", "worktree-agent-*", "--no-merged", "main"], root);
  if (unmerged.ok) {
    const b = unmerged.out.split("\n").map(s => s.replace(/^[*+ ]+/, "").trim()).filter(Boolean);
    out.push(b.length ? `Unmerged agent branches (${b.length}): ${b.slice(0, 12).join(", ")}${b.length > 12 ? ", ..." : ""}` : "Unmerged agent branches: none");
  }
  const dirty = git(["status", "--porcelain"], root);
  if (dirty.ok && dirty.out) out.push(`Working tree: ${dirty.out.split("\n").length} uncommitted path(s) on the lead checkout. Commit before dispatching agents.`);

  try {
    const inbox = readdirSync(join(root, ".claude", "skills", "_inbox")).filter(f => f.endsWith(".md") && f !== "README.md");
    out.push(`Skills inbox: ${inbox.length} unfolded lesson file(s)${inbox.length ? ": fold after each wave (cyc-skills-curator; .claude/skills/_inbox/README.md)" : ""}.`);
  } catch { /* no inbox */ }

  const text = out.join("\n");
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS - 20) + "\n[cyc] (truncated)" : text;
}

/** The checkout-lock lines for this session start; never throws (a context hook cannot block). */
export function lockLines(root: string, input: { session_id?: unknown; source?: unknown } | null): string {
  try {
    return recordSessionStart(root, input).map(l => `[cyc] ${l}\n`).join("");
  } catch (e) {
    return `[cyc] Checkout lock: not recorded (${String(e).slice(0, 200)}); run \`node tools/checkout-lock.ts status\`.\n`;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const input = await readHookInput<{ session_id?: unknown; source?: unknown }>();
  const root = projectDir();
  process.stdout.write(lockLines(root, input) + orientation(root) + "\n");
}
