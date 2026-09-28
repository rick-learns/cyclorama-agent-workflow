# PLAYTEST REQUEST — M4 checkpoint (3 production games)

Date: YYYY-MM-DD. Build: commit `<sha>`. Everything below runs the exact retail ROMs recorded in
`roms/manifest.json`.

## How to play
1. **Museum (recommended):** in Claude's browser pane, start the `build-static` preview; or in a
   terminal from the repo root run `node tools/build-museum.ts`, then serve `build/` (the
   `build-static` config in `.claude/launch.json`, port 8177). Open
   `http://localhost:8177/museum/index.html`. Click a cartridge. Sound starts when you do.
2. **Offline file:** open `build/museum/index.html` directly in Chrome/Edge (works from file://
   with audio in a normal browser).
3. **Official app build:** `npm run app`, then http://localhost:8177/app/index.html.

## Controls (all games)
| Cyclorama pad | Keyboard | Game controller (standard layout) |
|---|---|---|
| D-pad | Arrow keys | D-pad or left stick |
| A | Z | Bottom face button |
| B | X | Right face button |
| C | C | Left or top face button |
| START | Enter | Start |
| Save / load state | F5 / F8 | — |
| Eject to shelf | Escape | — |

## The games
### 1. <TITLE> (<date>, <genre>, <SCRIM|CYASM>)
- Goal: … Typical run: … minutes. Win: … Lose: …
- Game-specific buttons: …
- Evidence: replay hash `…`, budget `cpu max …% p95 …%`, sprites …/16.
- Known concerns: …

### 2. <TITLE> …
### 3. <TITLE> …

## Known concerns (overall)
- Darkness and readability on your screen (canon: the machine looked best with the lights off).
- …

## Feedback wanted (short answers are fine)
1. For each game: was it fun past the first minute? What would you cut or add?
2. Did you understand the goal without reading? Where were you confused?
3. Difficulty: too easy, right, or too hard? Where exactly?
4. Controls: responsive? Any button that felt wrong?
5. Music, sound and juice: enough? Anything grating after a few loops?
6. Readability: anything too dark to see?
7. Do the three feel like 1987 launch titles on the same machine?
8. Anything that feels like an existing game too closely?

## Budget re-baseline (optional, one time only)
| Milestone | Budget | Used | Proposed |
|---|---:|---:|---:|
| M4 | 36 | … | … |
| … | | | |
Reasoning: …

## To continue
Create `PLAYTEST_APPROVED.md` at the repo root with your feedback, and write "budgets approved as
proposed" (or your numbers) if you approve the re-baseline.
