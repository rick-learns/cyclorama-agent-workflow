---
name: cyc-playtest-checkpoint
description: The mandatory human playtest checkpoint of M4 (MISSION.md). Use when a production game has just met acceptance and the count of accepted production games may have reached three, when writing PLAYTEST_REQUEST.md or the checkpoint HALT.md, or when resuming after PLAYTEST_APPROVED.md appears.
---

# Human playtest checkpoint

MISSION.md M4: after **exactly three** production games meet their acceptance criteria, write
PLAYTEST_REQUEST.md and enter CHECKPOINT. Production-game development does not continue until
`PLAYTEST_APPROVED.md` exists. Reaching the checkpoint without that file is a HALT condition.

The pre-playtest set (STATE.md "M4 progress") is ERG: NIGHTSIDE RUN (SCRIM platformer, pack-in),
SHADEWORKS (CYASM puzzle) and HOUSELIGHTS (SCRIM maze action). Test and pipeline cartridges
(Lantern Test, Slice Test, Sound Test) don't count.

## When a game is accepted, count
- A game counts only when **every** item of `cyc-new-cartridge/checklist.md` has evidence
  (replay passing, budget OK, museum play, canon registered, verify green, committed).
- If the count is below three, update STATE.md and continue.
- If the count is **exactly three**, stop production work now and do the steps below. Don't
  start a fourth game, not even in an agent. Tell any running production-game agents to stop
  (`TaskStop`) and record where they got to. Tooling, museum and archive work may continue only if
  it doesn't change the three games.

## 1. Make the games playable for the human
- `node tools/build-museum.ts` → `build/museum/index.html` (all three on the shelf, verified
  against the manifest).
- The official app too: `npm run app` → `build/app/index.html` (served at `/app/index.html`).
- Start the static server: `preview_start` with name `build-static` (`.claude/launch.json`,
  port 8177, serves `build/`). Then open `http://localhost:8177/museum/index.html`. Audio needs
  this server: file:// in the in-app pane loads as a data: snapshot without AudioWorklet (skill
  `cyc-show-human`).
- Take real screenshots of each game (title, play, win) into `.tmp/playtest/`.

## 2. Write `PLAYTEST_REQUEST.md` (repo root)
Use [templates/PLAYTEST_REQUEST.md](templates/PLAYTEST_REQUEST.md). It must contain:
- how to play: the museum URL above, the file:// fallback (no audio in the in-app pane; audio
  works in a normal browser), and the app build if present;
- controls per game: the pad mapping, the keyboard mapping (arrows, Z = A, X = B, C = C,
  Enter = START, F5 save, F8 load, Esc eject), and the gamepad mapping;
- per game: goal, how long a run takes, what winning looks like, and the replay evidence (hash);
- **known concerns**, stated honestly (difficulty spikes, dark screens, music loops, any
  measurement near a limit);
- **specific feedback questions** (fun, clarity, difficulty, darkness/readability, controls feel,
  music/juice, era plausibility), each answerable briefly;
- the budget question: whether the human approves a **one-time re-baseline** of iteration budgets
  (show used/budget per milestone from STATE.md), and what you propose.

## 3. Write `HALT.md` and stop
Use [templates/HALT-checkpoint.md](templates/HALT-checkpoint.md):
- reason: the three-game checkpoint was reached and PLAYTEST_APPROVED.md does not exist;
- evidence: the three games with commit, replay hash, budget line, museum proof;
- smallest human decision: play the games, then create `PLAYTEST_APPROVED.md` with your feedback,
  optionally approving a one-time budget re-baseline.

Update STATE.md: CHECKPOINT row "IN PROGRESS: waiting for PLAYTEST_APPROVED.md", Blockers, and
Next action "Await PLAYTEST_APPROVED.md". Add a DECISIONS.md line. Commit PLAYTEST_REQUEST.md,
HALT.md, STATE.md and DECISIONS.md with specific paths. Tell the human in a short message where
to play and what to answer. **Stop.**

## 4. Resume (only when `PLAYTEST_APPROVED.md` exists and was written by the human)
1. Read it fully. Its feedback is the new top priority.
2. Record in DECISIONS.md: the approval, a summary of the feedback, and, **only if approved
   there**, the budget re-baseline (old → new per milestone). It is allowed once, ever.
3. Apply the feedback to the three games first. Re-record replays, rebuild the manifest, rerun
   the budgets, and re-verify.
4. Delete `HALT.md` in the same commit that records the resumption (git keeps its history).
5. Mark CHECKPOINT PASSED in STATE.md, then resume M4 from the **next unfinished title**.
