// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// PreToolUse hook for Edit/Write/NotebookEdit, used in agent-definition frontmatter to keep a role
// away from a file, e.g. the brand historian from canon/canon.json:
//   node tools/hooks/deny-path.ts <path suffix> <reason>
// Blocks (exit 2, reason on stderr) when tool_input.file_path (or notebook_path) ends with the
// suffix. FAILS SAFE: unreadable input or a missing suffix argument also blocks, since the hook is
// only wired for the role's edit tools and a silent allow would defeat it.
import { readHookInput } from "./hook-io.ts";

export function normalise(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

const [suffix, ...why] = process.argv.slice(2);
const input = await readHookInput<{ tool_input?: { file_path?: string; notebook_path?: string } }>();
const target = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (!suffix || !input) {
  process.stderr.write("Blocked by tools/hooks/deny-path.ts (fail-safe): the hook could not read its input or configuration.\n");
  process.exitCode = 2;
} else if (typeof target === "string" && (normalise(target) === normalise(suffix) || normalise(target).endsWith("/" + normalise(suffix)))) {
  process.stderr.write(`Blocked: ${why.join(" ") || `this role may not edit ${suffix}.`}\n`);
  process.exitCode = 2;
}
