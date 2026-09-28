# SCRIM game patterns: code skeletons and compiler notes

Detail for [SKILL.md](SKILL.md). Every snippet is condensed from a shipped ROM; read the real
file for the complete version.

## File split (ERG, `roms/erg/`)
| File | Holds | Bank |
|---|---|---|
| `erg.scr` | PROGRAM, HEADER, the first documented RAM words, INCLUDEs, LINK/EXTERN, asset banks, interrupts, `vblankWork`, `frame`, `runLoad`, main body | 0 |
| `erg-data.scr` | CONSTs and DATA (physics, tile numbers, text tables) | 0 |
| `erg-vars.scr` | the rest of work RAM, ending with `SND_RAM` and `ramEnd` | RAM |
| `erg-video.scr` | bank-switching DMA helpers, text, HUD, sprites, lights | 0 |
| `erg-play.scr` | bank-0 loaders (`stageInit`), then `BANK 5;` and the FAR gameplay procs | 0, 5 |
| `erg-screens.scr` | FAR screen loads and per-state procs; ends with `BANK 0;` | 5 |

The INCLUDE order fixes RAM addresses: the documented words (`gameState` first) are declared in
the main file before any INCLUDE. HOUSELIGHTS keeps everything in one 1,400-line file; that works
for layout A.

## Main file skeleton (layout B, from `roms/erg/erg.scr`)
```
PROGRAM Game;
HEADER title = "GAME", dev = $0001, date = $19870918, version = $0100;
VAR gameState: WORD;          -- $8000, first
    stage: WORD;              -- $8002 ...
INCLUDE "game-data.scr"; INCLUDE "game-vars.scr"; INCLUDE "game-video.scr";
INCLUDE "game-play.scr"; INCLUDE "game-screens.scr";
LINK "../lib/cuesound.inc";
LINK "../lib/curtainup.inc";
EXTERN FUNC CurtainUp: WORD;
EXTERN PROC SndInit;  EXTERN PROC SndPlaySong(song: WORD);  EXTERN PROC SndSfx(sfx: WORD);
EXTERN PROC SndTick;  EXTERN PROC SndTempo(rate: WORD);     EXTERN PROC SndStop;
EXTERN CONST SONG_title, SONG_stage: WORD;
BANK 1; ASSET "game.art"; EXTERN DATA COMMON, SPRITES: ARRAY OF BYTE;
DATA map1: ARRAY OF BYTE = INCBIN "stage1.map";
BANK 6; ASSET "game.song";            -- selected around every driver call
BANK 0;

INTERRUPT PROC onVblank;
VAR bk: WORD;
BEGIN
  bk := BANK_PORT; BANK_PORT := MUSIC_BANK; SndTick; BANK_PORT := bk;
  BG1SCX := 0;                        -- HUD rows scroll 0 until the LINE split
  ticks := ticks + 1;
  IF_PORT := 1
END;
VECTOR VBLANK := onVblank;

INTERRUPT PROC onLine;                -- LINECMP = 15: one store, nothing else
BEGIN
  BG1SCX := splitX;
  IF_PORT := 2
END;
VECTOR LINE := onLine;

PROC vblankWork;                      -- everything the chip needs before line 0
VAR i, bk: WORD;
BEGIN
  bk := BANK_PORT;
  VCTRL := vctrlSh;
  DMASRC := WORD(@oam[0]); DMADST := 0; DMALEN := 256; DMACTL := 2;
  ... lights from shadow lsh[], AMBIENT, scrolls, queued column/cell draws ...
  BANK_PORT := MUSIC_BANK;            -- driver calls mask interrupts: only here
  IF songReq <> 0 THEN SndPlaySong(songReq); songReq := 0 END;
  FOR i := 1 TO sfxN DO SndSfx(sfxQ[i - 1]) END; sfxN := 0;
  BANK_PORT := bk
END;

BEGIN
  t0 := CurtainUp;
  MEMSET(PW($8000), 0, WORD(@ramEnd) - $8000);
  WAVE0 := 0; ... WAVE7 := 0;
  BANK_PORT := MUSIC_BANK; SndInit;
  LINECMP := 15;
  last := PAD1;                       -- a held START is not a press
  pendingLoad := LD_TITLE; runLoad;
  IF_PORT := 3; IE := 3; ASM EI END;
  WHILE TRUE DO
    t0 := ticks;
    REPEAT WAIT UNTIL ticks <> t0;    -- LINE also ends WAI
    IF pendingLoad <> 0 THEN runLoad  -- VCTRL := 0 inside; display on again next VBLANK
    ELSE vblankWork; frame END
  END
END.
```

## Bank-restoring helper (bank 0, called from FAR code)
```
PROC dmaVram(bk, src, dstTile, words: WORD);
VAR old: WORD;
BEGIN
  old := BANK_PORT; BANK_PORT := bk;
  DMASRC := src; DMADST := dstTile * 24; DMALEN := words; DMACTL := 1;
  BANK_PORT := old
END;
```
Use it as `dmaVram(1, WORD(@COMMON), 0, span(WORD(@COMMON), WORD(@HUD_PAUSE), 24))`, where
`span(a, b, lastBytes) = (b + lastBytes - a) SHR 1` counts words between two labels.

## Layout A start-up (from `roms/houselights/houselights.scr`)
```
BANK 1; ASSET "game.art"; ASSET "game.song";
EXTERN CONST COMMON, TITLE, CRAM_TITLE: WORD;   -- labels as plain addresses for DMA
BANK 2; LINK "../lib/curtainup.inc";            -- the EXTERN FUNC CurtainUp stays in bank 0
BANK 0;
...
BEGIN
  BANK_PORT := 2; CurtainUp; BANK_PORT := 1;    -- interrupts are still off
  VCTRL := 0;
  MEMSET(@gameState, 0, WORD(@ramEnd) + 2 - $8000);
  ... clear all VRAM and CRAM by DMA from a zero buffer, WAVE0-7 := 0, SndInit, hide sprites ...
  prevPad := $FF;
  IF_PORT := 1; IE := 1; ASM EI END;
  WHILE TRUE DO WAIT; commit; frame END
END.
```

## Compiler rough edges
| Symptom | Cause | Fix |
|---|---|---|
| "expected BEGIN … found 'STEP'" at a VAR line | a name equal to a keyword (`step`, `bank`) | rename (`stp`, `bk`) |
| error on a parameter `r0`, `R3`, `sp` | register names are reserved in any case (§9.16) | rename |
| "already defined" at an `ASSET` line | a CONST or DATA name equals an `.art` label | prefix game constants differently |
| string table won't parse / wrong lengths | adjacent string literals don't concatenate | `ARRAY [n] OF ARRAY [m] OF BYTE = ("…", "…")` |
| "POINTER TO ARRAY … not compatible with POINTER TO BYTE" | `@s` of an array (§9.22) | `@s[0]` |
| non-FAR procedure after `BANK n` | §9.12 | `FAR PROC`, or move it before `BANK n` |
| `EXTERN PROC` after `BANK n` | externals live in bank 0 (§10.4) | declare it in the bank-0 section; LINK may sit elsewhere |
| `EXTERN CONST` in CONST, CASE label or array size | only known at link time (§10.4) | use a SCRIM CONST, or compute at run time |
| garbage in a local | locals are not zeroed (§9.11) | initialise |
| `VECTOR LINE := label` refused | VECTOR takes only an INTERRUPT PROC | write the handler in SCRIM (one store fits) |

The parser stops at the first syntax error; semantic errors are collected up to 20 (§9.21), so
fix syntax errors one compile at a time and semantic errors in batches.
