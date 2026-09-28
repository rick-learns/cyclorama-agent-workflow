---
name: cyc-show-human
description: How to show the human real Cyclorama progress (the museum or app running real ROMs in the browser pane, full-page or screen screenshots, WAV renders). Use whenever the human wants to see, hear or play something, after a game or UI milestone lands, or when preparing playtest material.
---

# Showing the human

Everything shown is a **render of a real ROM on the real emulator**, built from the committed
sources. Never show mockups, edited images or concept renders as evidence of working behaviour.
If something isn't built yet, say so. Concept renders (`npm run concept`) may be shown only when
labelled as design exploration. Real-world brand and website mockups (`brand/`) have their own
rules, including reading every shot: skill `cyc-brand-mockups`.

## 1. Build what they'll see
```sh
node tools/build-museum.ts        # build/museum/index.html: every catalogued ROM, manifest-checked
npm run player -- roms/<name>/<name>.asm   # build/player/index.html: one ROM, plain reference player
npm run debugger -- roms/<name>/<name>.asm # build/debugger/index.html
```
The official app: `npm run app` → `build/app/index.html` (served at `/app/index.html`).
Build in the **main checkout**. The preview server serves the `build/` of the directory it was
started from, and agent worktrees have their own `build/`.

## 2. Open it in the in-app browser pane (with audio)
1. `preview_start` with `name: "build-static"` (`.claude/launch.json`: a tiny Node static server
   for `build/` on port 8177).
2. Navigate to `http://localhost:8177/museum/index.html` (or `/player/index.html`,
   `/debugger/index.html`).
3. Don't open `file://` in the in-app pane: it loads as a `data:` snapshot, so the AudioWorklet
   and relative loads fail and the game is silent. file:// is fine in the human's own Chrome/Edge.
4. The browser needs a user gesture before audio. Clicking a cartridge or pressing a key counts;
   **a gamepad press does not**, so after a gamepad-only launch the page must ask for a key or
   click to start sound.

Tell the human the keys every time:

| Pad | Keyboard | Controller |
|---|---|---|
| D-pad | Arrow keys | D-pad / left stick |
| **A** | **Z** | bottom face button |
| B | X | right face button |
| C | C | left/top face button |
| START | Enter | Start |
| Save / load state | F5 / F8 | — |
| Eject | Escape | — |

Curtain Up plays first on first-party carts; START skips it after half a second. Dev-kit test
carts can be silent by design: LANTERN TEST (and its SCRIM edition) plays a note only when A
(keyboard Z) is pressed. Say so whenever you show one.

## 3. Screenshots (Playwright, headless, real ROM)
Use [shoot.ts](shoot.ts) (tested against `build/museum/index.html`):
```sh
node .claude/skills/cyc-show-human/shoot.ts --out .tmp/shelf.png          # full-page shelf
node .claude/skills/cyc-show-human/shoot.ts --rom slice-test --press Enter@30 --frames 120 --canvas --out .tmp/slice-play.png
```
- `--rom` clicks `.cart[data-rom="<name>"]`. `--press Key@frame` presses a KeyboardEvent.code
  (`Enter`, `KeyZ`, `ArrowRight`…) once the machine frame counter (`window.__museum.frames`)
  reaches that frame. `--frames N` waits for frame N. `--canvas` shoots only the 256×224 screen;
  the default is a full-page shot.
- It prints the frame and the machine state hash (cite them with the image) and any console
  errors (there should be none).
- Timing is real-time paced, so frame counts are exact but host timing isn't. For exact states,
  use the replay or the test harness instead of screenshots.
- A state word changes before its screen is shown: ERG sets `GAME_STATE`=1 while the title still
  loads with the display off. Wait about 20 more frames (or for the picture) before sampling.
- Keep images in `.tmp/` (git-ignored). Read the PNG yourself before sending it, and describe
  what it shows accurately.

## 4. Sound
Render a WAV of the real cartridge: `node tools/song-wav.ts roms/<name>/<name>.asm --out .tmp/<name>.wav`
(skill `cyc-assets-and-sound`). It prints the measured driver cost. It assembles CYASM only; for
a SCRIM cartridge use the recipe in `cyc-assets-and-sound` "Rendering a WAV".

## 5. Deliver
- Send PNG or WAV files with `SendUserFile` when the session has it (load it with ToolSearch).
  Otherwise give the absolute path (`<repo>\.tmp\<file>`).
- Say what it is: ROM name, manifest SHA-256 prefix or replay hash, frame number, what the
  human should notice, and any known flaw. Honest captions only.
- For a playable check, give the URL, the keys and a one-line goal. For playtests, use skill
  `cyc-playtest-checkpoint`.
