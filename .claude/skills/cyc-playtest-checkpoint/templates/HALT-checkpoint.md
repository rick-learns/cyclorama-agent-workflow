# HALT — three-game playtest checkpoint reached

Date: YYYY-MM-DD. Milestone: M4, iteration <used>/36.
Condition (MISSION.md HALT CONDITIONS): "The three-game human-playtest checkpoint has been
reached and PLAYTEST_APPROVED.md does not exist."

## Evidence
| Game | Commit | Replay hash | Budget (cpu max / p95, sprites) | Museum |
|---|---|---|---|---|
| <TITLE 1> | `<sha>` | `<hash>` | … | boots, plays with sound, save/load, eject: `<test name>` |
| <TITLE 2> | | | | |
| <TITLE 3> | | | | |
`node tools/verify.ts` green at `<sha>` (<n> tests). Details and play instructions:
PLAYTEST_REQUEST.md.

## Mitigations attempted
None needed: this is a planned stop required by MISSION.md, not a failure. No production-game work
continues past it.

## Smallest human decision needed
Play the three games (see PLAYTEST_REQUEST.md), then create `PLAYTEST_APPROVED.md` at the repo
root containing your feedback. Optionally approve the one-time iteration-budget re-baseline
proposed there.

## What resumes after the decision
Apply the feedback to these three games, record the approval (and any re-baseline) in
DECISIONS.md, delete this file, then continue M4 with the next unfinished title.
