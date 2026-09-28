// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// Fail-safe wrapper for the PreToolUse command guard (tools/agent-guard.ts).
// Claude Code treats any hook exit code other than 2, and a hook timeout, as "no decision": the
// command runs. So a guard that crashes (a bad edit, a failed merge, a native abort such as the
// Windows libuv assertion seen with Node 23.11) would silently ALLOW the dangerous command.
// This wrapper runs the guard as a child process and allows the call ONLY when the guard exits 0.
// Exit 2 passes the guard's reason through; anything else (crash, signal, timeout, missing file)
// blocks with a "fail-safe" message that says how to fix the guard.
//
// Usage (settings.json, exec form):
//   node --disable-warning=ExperimentalWarning <this file> <path to agent-guard.ts> [--timeout-ms=N]
// The inner timeout (default 6 s) stays below the hook timeout (10 s) so a hang becomes a block.
// Stdin is read with `for await` and the exit status is set with process.exitCode; never
// readFileSync(0) + process.exit() (tests/hooks.test.ts enforces this for every hook script).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FAIL_SAFE = "Blocked by tools/hooks/guard-failsafe.ts (fail-safe)";
const FIX = "The command guard did not return a verdict, so the command was not run. Fix the guard: `node --test tests/agent-guard.test.ts` (Edit/Read still work). The owner can disable hooks in /hooks if the guard itself cannot be fixed.";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const guard = args.find(a => !a.startsWith("--")) ?? fileURLToPath(new URL("../agent-guard.ts", import.meta.url));
  const timeout = Number(/^--timeout-ms=(\d+)$/.exec(args.find(a => a.startsWith("--timeout-ms=")) ?? "")?.[1] ?? 6000);
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (!existsSync(guard)) {
    process.stderr.write(`${FAIL_SAFE}: guard script not found (${guard}). ${FIX}\n`);
    return 2;
  }
  const r = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", guard], {
    input: raw, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 1 << 20,
  });
  if (!r.error && r.status === 0) return 0;
  if (!r.error && r.status === 2) {
    process.stderr.write(r.stderr || "Blocked by tools/agent-guard.ts.\n");
    return 2;
  }
  const why = r.error ? r.error.message : `exit ${r.status}, signal ${r.signal}`;
  process.stderr.write(`${FAIL_SAFE}: guard failed (${why}). ${(r.stderr ?? "").trim().slice(0, 400)}\n${FIX}\n`);
  return 2;
}

main().then(
  code => { process.exitCode = code; },
  err => { process.stderr.write(`${FAIL_SAFE}: ${String(err).slice(0, 300)}. ${FIX}\n`); process.exitCode = 2; },
);
