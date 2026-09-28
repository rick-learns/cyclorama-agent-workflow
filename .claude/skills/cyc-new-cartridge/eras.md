# Technique eras (detail for [SKILL.md](SKILL.md) §0)

The canon date sets the era. A title may use its era's technique and any earlier one, never a
later one, and never a hardware change (`src/machine` is frozen). Design ideas per era for games
4–12: `docs/games/LINEUP_PROPOSAL.md`.

| Era | Years | Technique | Notes |
|---|---|---|---|
| Lantern | 1987 | ramp shade planes, one light following the player, AMBIENT, unlit/FIXED for text | No mid-frame light-register writes and no probe. A LINE-interrupt **scroll** split for a status panel is allowed (manual 5.13; ERG acceptance ruling, DECISIONS 2026-09-26). Effects come from non-wrapping lights plus sprites (ERG's dash-punch: a small light + a ring sprite), never deliberate adder wrap. |
| Gel swap | 1989 | shade planes hold unrelated colours (hidden ink, washes) | Can be bright: AMBIENT 4 with a negative lamp dipping into unrelated planes 0–3 (LINEUP_PROPOSAL). |
| Flying | 1990–91 | light registers rewritten from the LINE interrupt | More than 4 lights per frame, never more than 4 per line. See "Raster budgets" below. |
| Overdrive | 1992 | the 3-bit adder deliberately wraps into contour rings | |
| Follow-spot | 1993–94 | probe and lights moved mid-frame as a coprocessor | See "Raster budgets" below. |

Board: Standard 32–256 KiB from 1987-09-18; Deep 512 KiB–1 MiB with optional 8 KiB battery RAM
only from October 1990 (header date ≥ `$19901001`). The budget tool enforces both.

## Raster budgets (plan these before a Flying or Follow-spot design is approved)
- From the LINE interrupt at dot 256 to dot 0 of the next line there are 57 CPU cycles; entry
  (12) and the longest instruction (19) leave **26** for the handler's stores. A SCRIM
  `INTERRUPT PROC` spends 18 more on PUSHM: one store fits (skill `cyc-scrim-game-patterns` §4).
- **Flying:** a light used as a per-line span needs two stores (X centre, Y width), so three
  lights = 36 cycles, over the 26. Pipeline line y+1's writes during line y, or update every
  second line, and prototype the handler on a throwaway dev-kit timing cart before a production
  title depends on it.
- **Follow-spot probe sampling:** only PROBEX/PROBEY must land before dot 0 of the sampled line
  (2 stores, 12 cycles); reading PROBE, acknowledging IF and moving LINECMP can finish after
  dot 0. One capture per line gives near-horizontal rays few samples: design thick walls, or
  sample shallow rays across several frames.
- A mechanic can make the limit the rule: a Lantern game's four lights = the lamp + three flares.
