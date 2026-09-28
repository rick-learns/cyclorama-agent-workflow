---
name: cyc-scrim-game-patterns
description: SCRIM idioms proven by ERG NIGHTSIDE RUN and HOUSELIGHTS for a full-size Cyclorama game - bank layout when code overflows bank 0 (FAR procs, bank-restoring helpers), frame loop and state machine, pad edge detection, deferred screen loads, Cue driver and Curtain Up calls across banks, INTERRUPT PROC raster splits and their cycle budget, ASSET/LINK/EXTERN placement, and SCRIM compiler errors with their workarounds. Use when planning or writing a SCRIM cartridge, when bank 0 overflows or a SCRIM compile fails, or when adding a LINE-interrupt effect.
---

# SCRIM game patterns

Two production games show what works; copy their structure instead of rediscovering it:
- **ERG: NIGHTSIDE RUN** (`roms/erg/`, 128 KiB): five INCLUDEd source files, gameplay as FAR
  procs in bank 5, art in banks 1–4, music in bank 6, a LINE-interrupt HUD split.
- **HOUSELIGHTS** (`roms/houselights/houselights.scr`, 64 KiB): one file, all code in bank 0,
  art and music in bank 1 selected for the whole run, Curtain Up linked in bank 2.

Language authority: `docs/scrim-spec.md` (§4 procedures, §9 rulings, §10 linking). Code
skeletons and the full list of compiler rough edges: [reference.md](reference.md). Formats and
the driver API: skill `cyc-assets-and-sound`. Tests and replay: skill `cyc-completion-route`.

## 1. Plan the banks before the first line (ERG's biggest time sink)
- A full game's SCRIM code is **11–16 KiB** (HOUSELIGHTS ~11 KiB; ERG ~16 KiB before the driver
  and Curtain Up). Bank 0 (16 KiB) also holds vectors, header, runtime, the Cue driver and Curtain
  Up. A design bank plan that says "all code in bank 0" fails at the first compile of a large
  game (ERG had to move gameplay into bank 5 mid-build). The design's §16 must budget code bytes.
- On day one compile a skeleton with every state stubbed, and rerun after each subsystem:
  `npm run scrim -- roms/<name>/<name>.scr -o .tmp/<name>.rom --report` (per-proc bytes/cycles).
  Move code out before bank 0 is full, not after.
- Pick one layout:

| Layout | Fits | Model |
|---|---|---|
| A. Code in bank 0; one data bank selected for the whole run | code ≤ ~11 KiB, art + music ≤ 16 KiB | HOUSELIGHTS: `BANK 1; ASSET "x.art"; ASSET "x.song";`, `BANK_PORT = 1` after start-up; nothing FAR |
| B. FAR code bank + art banks + a music bank | anything bigger | ERG: bank 5 FAR procs, banks 1–4 art and maps, bank 6 `erg.song` |

- Layout B rules:
  - Every procedure after `BANK n` (n ≥ 1) must be `FAR PROC` / `FAR FUNC` (§9.12). The call
    goes through a bank-0 trampoline that saves and restores BANK.
  - DATA that FAR code reads sits in bank 0 or in that code's own bank (§9.12). Loaders, map
    scans and DMA that read *another* bank stay in bank 0.
  - **Every bank-0 helper that writes `BANK_PORT` saves and restores it**: FAR code calling it
    runs in the window, and returning into the wrong bank crashes (ERG `dmaVram`, `loadCram`,
    `stageInit`). Interrupt handlers that switch banks do the same (ERG `onVblank`).
- `EXTERN PROC/FUNC` must be declared in the bank-0 section (§10.4) even when its LINKed code
  lives elsewhere; select the bank by hand around the call, e.g. at power-on with interrupts
  still off: `BANK_PORT := 2; CurtainUp; BANK_PORT := 1;` (HOUSELIGHTS).
- To DMA art from bank-0 code, take the address with `WORD(@LABEL)` (`@` works anywhere) or
  declare the art labels `EXTERN CONST` (HOUSELIGHTS), select the bank, then DMA: DMA reads the
  window as the CPU sees it.

## 2. Frame loop and state machine
- Declare `gameState` as the **first module VAR** so it lands at `$8000`, then the other
  documented words in a fixed order (ERG: nine words at `$8000-$8011`).
- One procedure per state (`titleFrame`, `playFrame`…) and one per screen load (`loadTitle`…),
  dispatched by `CASE gameState OF` (dense → a jump table, §9.9).
- **Pad edges:** read `PAD1` once per frame; `pressed := pad AND NOT last; last := pad;`. Treat
  LEFT+RIGHT together as neither. Right after `CurtainUp` returns seed `last := PAD1` (or
  `prevPad := $FF`) so a START still held from skipping the splash is not a press.
- **Commit first, logic after:** on waking in vertical blank write OAM (DMA), lights, AMBIENT,
  scroll and queued VRAM/CRAM updates, then run the frame's logic, which may run past line 0.
  Tests must observe at WAI (skill `cyc-completion-route` §3).
- **Deferred whole-screen loads:** logic sets `pendingLoad`; the next wake runs it first with
  `VCTRL := 0`, and the display comes back on at a later vertical blank, never mid-frame. The
  budget tool then counts blanked loads, not overruns (ERG: 118 blanked-load frames, 0 overruns).
- After `CurtainUp`: MEMSET every module VAR from `$8000` to `@ramEnd` (this includes
  `SND_RAM`), zero `WAVE0`–`WAVE7`, `SndInit`, clear VRAM/CRAM, hide all sprites.
- With a LINE interrupt enabled, `WAIT` also wakes on LINE: wait on a VBLANK tick counter,
  `t0 := ticks; REPEAT WAIT UNTIL ticks <> t0;` (ERG main loop).

## 3. The sound driver from SCRIM
- Songs outside bank 0: select the music bank around **every** driver call and restore the
  caller's bank (the VBLANK handler around `SndTick`; the main loop around `SndPlaySong`,
  `SndSfx`, `SndTempo`). Curtain Up keeps its own chime beside its code.
- Driver calls mask interrupts briefly. A game with a LINE split queues song, tempo and effect
  requests during logic and makes every driver call in its vertical-blank work (ERG
  `vblankWork`: `songReq`, `tempoReq`, `sfxQ`), never while the picture is drawn.

## 4. Interrupts and raster splits
- `VECTOR` takes only an `INTERRUPT PROC` (no ASM label). It saves all 8 registers (PUSHM,
  18 cycles) and must acknowledge its own IF bit (§9.13). (until SCRIM gets a register-light
  interrupt form)
- Cycle budget from the LINE interrupt at dot 256 to dot 0 of the next line: **57 CPU cycles**.
  Entry 12 + the longest instruction 19 leave 26 for an assembly handler; SCRIM's PUSHM leaves
  about 8, so **one** store fits: ERG's HUD scroll store starts ≤ 55 cycles after dot 256.
- A Lantern status-panel **scroll** split is legal (manual 5.13; ERG acceptance ruling). Flying-era
  per-line **light** rewrites need two stores per light (three lights = 36 cycles) and don't fit
  even in assembly: pipeline line y+1's writes during line y, or update every second line, and
  prototype on a dev-kit timing cart first (skill `cyc-new-cartridge`, [eras](../cyc-new-cartridge/eras.md)).
- Nothing may mask interrupts while the display runs (driver calls, long `ASM DI` sections).
- Prove raster timing with a bus-watching `Tally` subclass that logs the start `masterCycle` of
  each register write (tests/erg.test.ts `SplitWatch`: 7,000+ split writes, 0 late).

## 5. Compiler rough edges (each one cost a compile round trip)
- Parameters, locals and VARs may not be named like keywords (`step`, `bank`…), registers
  (`r0`–`r7`, `sp`, any case) or I/O registers (§9.16). The error points at the VAR line:
  "expected BEGIN … found 'STEP'".
- Adjacent string literals don't concatenate. A table of strings is
  `DATA t: ARRAY [n] OF ARRAY [m] OF BYTE = (...)`.
- A game CONST named like an `.art` block label fails at the ASSET line ("already defined"):
  prefix game constants differently from the art file's block names.
- `@arr` is `POINTER TO ARRAY`; write `@arr[0]`; pointer arithmetic via WORD: `PB(WORD(p) + i)^`
  (§9.22). No EI statement: `ASM EI END` (§9.2). Locals are not zeroed (§9.11).
- More, with the fixes: [reference.md](reference.md#compiler-rough-edges).

## 6. Video idioms
- BG maps are **64 entries wide**: set `VADDR` at the start of every row. Writing 32 entries and
  "continuing" writes the off-screen half of the same row (HOUSELIGHTS HUD bug, caught by a test
  reading the map).
- Keep AMBIENT + every overlapping light level ≤ 7 in Lantern-era games: the shade adder wraps.
