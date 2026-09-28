# Agent brief template (Avenell Cyclorama)

The role's rules live in its agent definition (`.claude/agents/<role>.md`) and the standing
contract arrives by the SubagentStart hook, so a brief holds only the task: **20–40 lines**.
Commit before dispatching. Fill every <…>, delete what doesn't apply. Decisions go in the brief,
not in questions to the agent.

---

```
BRIEF v1 — <agent description> — main at <sha> — <date>
ROLE: <only when no agent definition fits, e.g. "SCRIM compiler engineer for the Avenell Cyclorama project">
OBJECTIVE: <one sentence: the user-visible result>
ACCEPTANCE (the contract; write these tests red first):
  - <exact test file / command that must pass, e.g. node --test tests/houselights.test.ts>
  - <checklist, e.g. .claude/skills/cyc-new-cartridge/checklist.md items 1-14>
DECISIONS ALREADY MADE: <numbered, with DECISIONS.md dates>. If you need a decision not listed: stop and ask.
READ FIRST: <paths: design doc, model code, spec sections>. Linked, not paraphrased.
DELIVERABLES:
  1. <path> — <what> — <how it is verified>
  2. <path> — <what> — <how it is verified>
OWNERSHIP: you own <paths>. Others own <paths> (running agents: <who>). Shared catalogs: append
  minimal entries only. Never edit STATE.md, DECISIONS.md, canon/canon.json, roms/manifest.json.
OUT OF SCOPE: <what not to fix even if you see it; list it in the report instead>.
STOP AND REPORT IF: canon or hardware would have to change; a name fails clearance; the
  acceptance test still fails after 3 materially different attempts.
REPORT: the agent definition's format (under ~60 lines; first line echoes BRIEF v<n>; long
  evidence in a file, cite its absolute path). <anything extra>
```

---

## Notes for the lead
- **Mid-flight change:** SendMessage "BRIEF v2: <delta>" (skill `cyc-agent-dispatch`).
- **No agent definition?** Add to the brief the repo facts the role needs (Node 24 erasable
  TypeScript with `.ts` imports; `node --test tests/<file>.test.ts`; `node tools/verify.ts
  --allow-dirty`; determinism; frozen hardware; fiction/name rules) and the report format:
  branch and commits, files, tests red→green with commands and counts, measurements, DECISIONS
  lines ready to paste, known gaps.
- **Lessons:** the contract asks every agent for `.claude/skills/_inbox/<branch>.md`, first line
  `# Lessons from <branch>`, then `- [skill] <imperative rule> — evidence: <what happened> —
  scope: always | until <condition>` (or "none"); the SubagentStop hook enforces the file. See
  `.claude/skills/_inbox/README.md`.
- **Cartridge brief:** names already cleared (title, stages, songs, achievements; late renames
  change ROM bytes), the bank plan with code bytes, and ACCEPTANCE pointing at the done-list in
  `cyc-new-cartridge` §5.8. Tell the builder to merge main before the first line of code.
- **Research or tool-evaluation brief:** ask the agent first to establish which company owns
  each named product ("Laya" in one brief was a rival's model, not the vendor's).
- **Planning briefs:** proposed canon stays in the agent's own file with local ids (skill
  `cyc-canon`, PROPOSED CANON flow step 1).
- **Verifier brief** (`cyc-acceptance-verifier`): "BRANCH: worktree-agent-<id>. CRITERION:
  <checklist or milestone>. BUILDER REPORT: <pasted>." Nothing else.
- **Outsider reviewer brief** (`cyc-outsider-reviewer`): the artifact paths, the output path,
  and for a re-check the previous review's path. Always a new instance for the re-check.
