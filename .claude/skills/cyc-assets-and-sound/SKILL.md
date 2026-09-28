---
name: cyc-assets-and-sound
description: Cyclorama art, music and sound pipeline (.art tiles/sprites/palettes, .song tracker files, the Cue Sound Driver, the Curtain Up splash, SCRIM asset linking, concept scene renders, WAV rendering). Use when adding graphics or music to a cartridge, calling the sound driver from CYASM or SCRIM, measuring driver cost, or producing a listenable WAV or concept image for the human.
---

# Assets and sound

Assets stay **human-readable text in the repo**. Every ROM build converts them on demand, so a
ROM is a pure function of the sources and rebuilds byte-identically.

## On-demand conversion (`tools/art.ts` `sourceReader`)
Every ROM build (`tools/build-roms.ts`, the tests, `tools/song-wav.ts`) reads sources through
`sourceReader`. When a request for `x.art.inc` or `x.song.inc` has no file on disk, it is
generated from `x.art` (`convertArt`) or `x.song` (`convertSong`). Never commit generated `.inc`
files. In CYASM:
```
        .include "mygame.art.inc"      ; from mygame.art
        .include "mygame.song.inc"     ; from mygame.song
```

## `.art` format (`tools/art.ts`)
`;` starts a comment. One directive per block:
- `@tiles NAME`: rows of pixels `0`–`7` (`.` = 0). Width and height are multiples of 8. Emitted as
  8×8 tiles in row-major order.
- `@sprite16 NAME`: exactly 16×16, emitted as tiles TL, TR, BL, BR (Barndoor 16×16 order).
- `@palette NAME`: up to 7 colours `$RGB` for indices 1–7. Index 0 is `$000` unless the line
  starts `0=$RGB`.
- Each tile or sprite block defines `NAME` (data address) and `NAME_TILES` (tile count).
- 3 bits per pixel, planar (3 planes × 8 bytes per tile). Colour 0 is transparent. Shade planes:
  write one palette per plane (SHADEWORKS uses `PAL0_SHADE0..7`).

All art must be original, drawn for this project. Never trace or derive from commercial art
(MISSION M5). Tests: `tests/art.test.ts`.

## `.song` format and the Cue Sound Driver
Full reference: `roms/lib/README.md` §1–§2 (the authority). Essentials:
- Blocks: `instrument` (wave, env, vibrato, arp, slide, fixed), `pattern NAME [inst I]`
  (a note per token `C-4 C#4 Db4`, `---` rest-on, `off`, `:n` length, `@inst`, `|` bar),
  `song NAME` (title, `speed N` or `tempo BPM [beat R]`, voices, optional wavetable, `order`,
  `loop`), and `sfx NAME voice V [priority P] [speed S] [inst I]`.
- Emits `SONG_name`, `SONG_name_RATE`, `_ROWS`, `_LOOP_ROWS`, `_TITLE`, and `SFX_name`. Names are
  unique per ROM.
- Use a whole-number `speed N` when the loop must be frame-exact; `tempo BPM` can drift by one
  frame per loop.
- Every game writes **its own** `.song`. The driver is shared; the music is not.
- Driver (`roms/lib/cuesound.inc`, open: `Apache-2.0 WITH LLVM-exception`):
  ```
  SND_RAM = $8100                  ; 272 bytes (SND_RAM_SIZE), even address, before the include
  CALL SND_INIT / MOVW R0,#SONG_theme / CALL SND_PLAY_SONG
  vblank: CALL SND_TICK            ; once per frame, first in VBLANK
  MOVW R0,#SFX_hit / CALL SND_SFX  ; effect borrows its voice; music keeps its place
  SND_TEMPO (R0 = rate, 0 = song's own), SND_FADE (R0 = n frames/step), SND_STOP, SND_STATUS
  ```
  Arguments go in R0, and R1–R7 are preserved. The SCRIM stack-convention names are `SndInit`,
  `SndPlaySong`, `SndSfx`, `SndTick`, `SndTempo`, `SndFade`, `SndStop` and `SndStatus`.
- **Cost:** worst case measured 2,166 cycles per `SND_TICK` = 3.6 % of the 59,736-cycle frame;
  typical 800–1,150; the test limit is 3,000 (5 %). ROM ≈1,046 bytes of code + 216-byte note
  table; RAM 272 bytes; stack ≤26 bytes.
- Put tonal SFX on the least essential tone voice and noise SFX on voice 3, so lead and bass never
  drop out.
- Driver calls mask interrupts briefly: a game with a LINE-interrupt split queues effects and
  makes every driver call in its vertical-blank work, never mid-picture (ERG).
- Songs may live outside bank 0 if every driver call selects the song's bank and restores the
  caller's (VBLANK around `SndTick`, main loop around `SndPlaySong`/`SndSfx`/`SndTempo`); Curtain
  Up keeps its chime beside its own code. SCRIM layouts: skill `cyc-scrim-game-patterns` §1, §3.
- Song titles are ROM bytes (`SONG_x_TITLE`): clear them before the replay is recorded, or a
  rename means a new manifest entry, replay and golden frames (HOUSELIGHTS).
- Quick "does it sound thin" check: count silent 0.1 s windows in a render. HOUSELIGHTS' waltz
  had 32/300 with `env 12 down 2` bell, `down 1` bass, `5 down 1` chords; one more envelope step
  each (14 down 3, 13 down 2, 6 down 2) brought it to 4/300.
- Tempo lift under pressure: `MOVW R0, #SONG_theme_RATE * 5 / 4` / `CALL SND_TEMPO`.
- `SND_FADE` acts on master volume, so it fades effects as well as music.
- Tests: `tests/song.test.ts`, `tests/cuesound.test.ts`, `tests/sound-test.test.ts`.

## Curtain Up (`roms/lib/curtainup.inc`, BRAND)
- First-party cartridges call it first at power-on: `CALL CURTAIN_UP` (SCRIM stack name
  `CurtainUp`). It needs the sound driver included and `SND_RAM` defined. It returns R0 = 1 if
  START skipped it.
- It takes 152 frames after set-up (≈2.55 s). START skips it only from its frame 30. It leaves the
  display off, all lights, CRAM and its VRAM cleared, the driver initialised, and interrupts
  disabled (`roms/lib/curtainup.md`).
- **Brand asset:** source visible, not licensed. Homebrew and open demos may not show it, and the
  emulator and app must never check for it (TRADEMARKS.md). Adding it changes the ROM hash:
  re-record the replay.
- Tests: `tests/curtainup.test.ts`.

## SCRIM and assets (ASSET / EXTERN / LINK)
Landed after the SLICE gate (`docs/slice-gate.md` failure 8). Authority: `docs/scrim-spec.md`
§10; tests `tests/scrim-link.test.ts`.
```
ASSET "hero.art";                      -- converted by the kit, then linked
ASSET "hero.song";
LINK "../lib/cuesound.inc";            -- CYASM source, linked as written
VAR SND_RAM: ARRAY [136] OF WORD;      -- the driver's 272 bytes (§10.7)
EXTERN DATA HERO: ARRAY OF BYTE;       -- a ROM label
EXTERN CONST HERO_TILES: WORD;         -- an equate, known at link time
EXTERN PROC SndInit;  EXTERN PROC SndSfx(sfx: WORD);  EXTERN PROC SndTick;
```
- Declare driver RAM exactly as above: named after the library symbol, `ARRAY OF WORD` keeps it
  on an even address, and SCRIM startup zeroes it.
- `@string` of an array is `POINTER TO ARRAY [n] OF T`; write `@string[0]` where a
  `POINTER TO BYTE` is wanted (spec §9.22).
- Each `EXTERN PROC/FUNC` needs its own `EXTERN`; external routines live in bank 0.
- A game CONST named like an `.art` block label fails at the ASSET line ("already defined"):
  prefix game constants differently. Bank placement and more compiler notes: skill
  `cyc-scrim-game-patterns`.

## Rendering a WAV for the human
```sh
node tools/song-wav.ts                     # Sound Test theme, 20 s → .tmp/sound-test.wav
node tools/song-wav.ts roms/<name>/<name>.asm --song SONG_theme --seconds 30 --out .tmp/<name>.wav --skip-frame 40
```
This runs the real cartridge on the emulator (START at `--skip-frame` skips Curtain Up), waits
for the song's first row, and writes 16-bit mono at 47,940 Hz. It also prints the measured
`SND_TICK` cost. It **assembles CYASM** cartridges only. Then send the file (skill
`cyc-show-human`). For a SCRIM cartridge (until song-wav accepts `.scr`):
- one song cleanly: a throwaway SCRIM "jukebox" in `.tmp/` (`VAR SND_RAM`, `LINK cuesound.inc`,
  `ASSET x.song`, `SndPlaySong(SONG_x)` in main, `SndTick` in VBLANK);
- in game: run the real ROM with the replay pads to where the song plays, collect
  `m.audio.takeSamples()` each frame, and write with `wavBytes(pcm, Math.round(SAMPLE_RATE))`
  (`wavBytes` and `tickCycles` from `tools/song-wav.ts`, `SAMPLE_RATE` from `tools/song.ts`).
- `*.wav` is gitignored and the pre-commit hook rejects staged WAVs: renders live only in
  `.tmp/`, never in the repo.

## Concept renders (design exploration only)
`npm run concept` renders `tools/scene/scenes/*` through the real Barndoor line renderer, using a
scene kit that enforces hardware limits, into `docs/concept/*.png` plus a gallery (git-ignored).
For a subset: `npm run concept -- --only 01-,02- --out .tmp/concept`.
- Use them to agree on a look with the human before building.
- They are **never acceptance evidence**: not for M4, not a game screenshot, not a store image
  (DECISIONS 2026-09-26 [process]). Evidence is the real ROM running (skill `cyc-show-human`).
- `tools/scene/assets/` holds first-party character art (Erg, the stage cat): all rights reserved.
