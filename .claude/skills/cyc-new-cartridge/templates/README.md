# <TITLE>

*<One-line genre hook.>* <Developer>, <year>. Released <Month D, YYYY> (<region>). <Standard|Deep>
cartridge, <n> KiB. <Players>.

<Two or three sentences of in-world premise, period voice, no real-world names.>

## Controls (controller 1)

| Button | In play | On the title screen |
|---|---|---|
| D-pad | | |
| A | | |
| B | | |
| C | | |
| START | Pause / resume | Start the game |

(Museum keyboard: arrows, Z = A, X = B, C = C, Enter = START.)

## How to play
<Goal, rules, scoring, lives or setbacks, what winning means.>

## Screens
- **Title** … - **How to play** … - **Play/HUD** … - **Paused** … - **Game over** … - **The ending** …

## Sound
<Theme, cues, effects, and how the music reacts (tempo lift, etc.).>

## Tips
- …

---

## Developer notes

**Source.** <Language (SCRIM / CYASM)>; files and what each holds; assets (`.art`, `.song`)
converted at build time by `tools/art.ts` / `tools/song.ts`. Build with `npm run build:roms`.

**Completion state.** `GAME_STATE` is the work-RAM word at **`$xxxx`**:

| Value | State |
|---|---|
| `$0001` | title |
| … | … |
| `$000n` | **the ending** (terminal: stays until START) |

Other RAM words: … The completion recording is `replays/<name>.replay.json`.

**Techniques (<era>).** <Exactly which light-field features are used, and which are not.>

**Budgets.** <Board>; lights; max sprites on a line; CPU mean / p95 / max from
`node tools/budget.ts <name>`; voices.
