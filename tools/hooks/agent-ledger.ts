// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// PostToolUse hook on the Agent tool (async): appends one JSON line per launched agent to
// .tmp/agent-ledger.jsonl: agentId, description, type, main's sha at launch, time. The lead uses
//   node tools/hooks/agent-ledger.ts --since <agentId>
// to print what landed on main since that agent started (commits + files), ready for a
// SendMessage delta ("main moved (sha): <files>. Run `git merge --no-edit main` now").
// Async and logging-only: it cannot block anything; errors are swallowed.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { git, projectDir, readHookInput } from "./hook-io.ts";

type Row = { at: string; agentId: string | null; status: string | null; description: string; type: string; mainSha: string };
const ledgerPath = (root: string) => join(root, ".tmp", "agent-ledger.jsonl");

export function report(root: string, id: string): { code: number; text: string } {
  const file = ledgerPath(root);
  const rows: Row[] = existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as Row]; } catch { return []; } })
    : [];
  const row = rows.reverse().find(r => r.agentId === id);
  if (!row) return { code: 1, text: `no ledger entry for ${id}` };
  const log = git(["log", "--oneline", `${row.mainSha}..main`], root).out || "(nothing)";
  const files = git(["diff", "--stat", `${row.mainSha}..main`], root).out || "(none)";
  return { code: 0, text: `Agent ${id} (${row.description}) started at main ${row.mainSha}. Landed on main since then:\n${log}\nFiles changed:\n${files}` };
}

export function record(root: string, input: { tool_input?: { description?: string; subagent_type?: string }; tool_response?: { agentId?: string; status?: string } }): void {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  appendFileSync(ledgerPath(root), JSON.stringify({
    at: new Date().toISOString(),
    agentId: input.tool_response?.agentId ?? null,
    status: input.tool_response?.status ?? null,
    description: input.tool_input?.description ?? "",
    type: input.tool_input?.subagent_type ?? "general-purpose",
    mainSha: git(["rev-parse", "--short", "main"], root).out,
  } satisfies Row) + "\n");
}

const sinceIx = process.argv.indexOf("--since");
if (sinceIx > 0) {
  const r = report(projectDir(), process.argv[sinceIx + 1] ?? "");
  (r.code ? process.stderr : process.stdout).write(r.text + "\n");
  process.exitCode = r.code;
} else {
  const input = await readHookInput();
  try { if (input) record(projectDir(), input); } catch { /* logging only */ }
}
