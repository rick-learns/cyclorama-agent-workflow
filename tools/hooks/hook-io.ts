// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Shared helpers for the Claude Code hook scripts in tools/hooks/ (wired in .claude/settings.json).
// Stdin rule (Windows, Node 23.11): read the hook input with `for await` over process.stdin and
// finish by setting process.exitCode. Never `readFileSync(0)` followed by `process.exit()`: that
// pairing was observed to abort with a libuv assertion (exit 3221226505), which Claude Code treats
// as a non-blocking error. tests/hooks.test.ts checks every hook script for both patterns.
import { spawnSync } from "node:child_process";

/** The parsed hook input, or null when stdin is empty or not JSON. */
export async function readHookInput<T extends object = Record<string, unknown>>(): Promise<T | null> {
  try {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

/** The repo the hooks act on: CLAUDE_PROJECT_DIR (the main checkout, also for worktree agents). */
export const projectDir = (): string => process.env.CLAUDE_PROJECT_DIR || process.cwd();

export interface GitResult { ok: boolean; out: string }
/** Run git with a short timeout; never throws. */
export function git(args: string[], cwd = projectDir()): GitResult {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 5000, windowsHide: true });
  return { ok: r.status === 0 && !r.error, out: (r.stdout ?? "").trim() };
}

/**
 * Agent types that neither build nor commit: they get only the sync line at start and are never
 * held at stop. Built-ins plus the read-only project agents in .claude/agents/.
 */
export const NON_BUILDING_AGENTS = new Set(["Explore", "Plan", "claude-code-guide", "statusline-setup", "cyc-acceptance-verifier", "cyc-outsider-reviewer"]);
