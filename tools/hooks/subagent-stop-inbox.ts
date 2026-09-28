// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
//
// SubagentStop hook (finish gate): a worktree agent may not finish while its worktree has
// uncommitted work, or before it has committed its skills-inbox lesson file. Returning
// decision "block" keeps the subagent running and hands it `reason` as its next instruction
// (hooks docs, "SubagentStop"). It blocks at most once in a row (stop_hook_active).
//
// Safety: a quality gate, not a security guard, so it FAILS OPEN (no output) whenever it cannot
// identify the agent's branch or git fails. It never acts on the lead: SubagentStop fires only
// for subagents (and Claude Code's internal agents, which have no branch). Non-building agent
// types (Explore, Plan, the verifier, the outsider reviewer) are never held.
// Branch identification: `worktree-agent-<agent_id>` (Claude Code's naming, confirmed on the
// branches in this repo), else a worktree whose directory is `agent-<agent_id>`.
import { git, NON_BUILDING_AGENTS, projectDir, readHookInput } from "./hook-io.ts";

export interface StopInput { agent_id?: string; agent_type?: string; stop_hook_active?: boolean }

function worktrees(root: string): { path: string; branch: string }[] {
  const r = git(["worktree", "list", "--porcelain"], root);
  if (!r.ok) return [];
  const out: { path: string; branch: string }[] = [];
  let path = "";
  for (const l of r.out.split(/\r?\n/)) {
    if (l.startsWith("worktree ")) path = l.slice(9);
    else if (l.startsWith("branch refs/heads/")) out.push({ path, branch: l.slice(18) });
  }
  return out;
}

export function problemsFor(input: StopInput, root: string): string[] {
  if (input.stop_hook_active || !input.agent_id || NON_BUILDING_AGENTS.has(input.agent_type ?? "")) return [];
  const trees = worktrees(root);
  let branch = `worktree-agent-${input.agent_id}`;
  let tree = trees.find(t => t.branch === branch);
  if (!git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], root).ok) {
    tree = trees.find(t => /[\\/]agent-([^\\/]+)$/.exec(t.path)?.[1] === input.agent_id);
    if (!tree) return [];
    branch = tree.branch;
  }

  const problems: string[] = [];
  if (tree) {
    const dirty = git(["status", "--porcelain"], tree.path);
    const paths = dirty.ok ? dirty.out.split(/\r?\n/).filter(Boolean) : [];
    if (paths.length) {
      problems.push(`Your worktree has ${paths.length} uncommitted path(s) (${paths.slice(0, 6).map(l => l.slice(3)).join(", ")}${paths.length > 6 ? ", ..." : ""}). Commit what belongs to your deliverables on ${branch} (specific paths); delete scratch files.`);
    }
  }
  const ahead = Number(git(["rev-list", "--count", `main..${branch}`], root).out || "0");
  if (ahead > 0 || problems.length) {
    const inbox = `.claude/skills/_inbox/${branch}.md`;
    if (!git(["cat-file", "-e", `${branch}:${inbox}`], root).ok) {
      problems.push(`${inbox} is not committed on ${branch}. Write your tagged lessons there (\`- [skill] rule — evidence: ... — scope: ...\`, or "none") and commit it.`);
    }
  }
  return problems;
}

const input = await readHookInput<StopInput>();
const problems = input ? problemsFor(input, projectDir()) : [];
if (problems.length) {
  process.stdout.write(JSON.stringify({ decision: "block", reason: `Before you finish: ${problems.join(" ")} Then give your final report again.` }));
}
