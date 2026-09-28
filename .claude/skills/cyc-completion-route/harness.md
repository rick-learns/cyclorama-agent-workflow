# Completion-route harness code

Detail for [SKILL.md](SKILL.md). Condensed from `tests/houselights.test.ts`, `tests/erg.test.ts`
and `tests/erg-route.ts`; read them for the full versions.

## Build once, resolve symbols
```ts
const built = compile("roms/<name>/<name>.scr", sourceReader(p => /\.(scr|inc|art|song|asm)$/i.test(p)
  ? readFileSync(p, "utf8") : new Uint8Array(readFileSync(p))));
if (built.errors.length || !built.rom) throw new Error(built.errors.map(e => `${e.file}:${e.line}: ${e.message}`).join("\n"));
const rom = built.rom;
const S = (n: string) => { const v = built.symbols?.get(n); if (v === undefined) throw new Error(`no symbol ${n}`); return v; };
```
Read game words through symbols (`m.peek16(S("ergX"))`), so a RAM-layout change can't silently
point the player at the wrong word. Sign-extend positions: `(v << 16) >> 16`.

## Observe at WAI
Option 1, step to idle after each frame (HOUSELIGHTS `Run.frame`):
```ts
frame(pad = 0) {
  this.m.runFrame(pad, 0);
  this.pads.push(pad);
  const limit = this.m.frame * MASTER_PER_FRAME + 224 * MASTER_PER_LINE;   // never past the next VBLANK
  while (this.m.cpu.mode === "run" && this.m.masterCycle < limit) this.m.step(limit);
}
```
Option 2, a hook that fires when the main loop goes idle (ERG `Run`):
```ts
const step = this.m.step.bind(this.m);
this.m.step = (limit = Infinity) => {                  // measured from outside; nothing changes
  const t0 = this.m.masterCycle, before = this.m.cpu.mode, c = step(limit), after = this.m.cpu.mode;
  if ((this.m.video.regs.VCTRL & 1) && (t0 % (262 * MASTER_PER_LINE)) < 224 * MASTER_PER_LINE) this.displayOn = true;
  if (before === "run" && after === "wait") this.onIdle?.();
  return c;
};
```
Note `t0` (the step's start), not the cycle after it, in the display check.

## One run: completion, golden frames and budget (tests/houselights.test.ts)
```ts
class Run {                                   // metered = the budget tool's own meter drives the machine
  constructor(metered = false) {
    if (metered) { this.meter = budgetMeter(rom); this.m = this.meter.m; } else this.m = new Machine(rom, { cpu: new Tally() });
  }
  frame(pad = 0) {
    if (this.meter) this.meter.frame(pad, 0); else this.m.runFrame(pad, 0);
    this.pads.push(pad);
    this.onFrameEnd?.(this.m.frame);          // golden capture: right after runFrame, before stepping to WAI
    /* step to WAI as in "Observe at WAI" (the meter counts those steps toward the next frame) */
  }
}
let cached: Solve | null = null;
function solve(): Solve {
  if (cached) return cached;
  const r = new Run(true), golden = goldenRecorder("<name>");
  r.onFrameEnd = n => golden.capture(n, r.m.framebuffer);
  /* play the route to WIN + 60 frames */
  return (cached = { run: r, golden, winFrame, ... });
}
const metered = () => solve().run.meter!.report({ name: "<name>", input: "the scripted completion run" });
// replay test: pads/frames/hash equal the replay file (below); metered().hash === run.m.hash()
// golden test: assert.deepEqual(solve().golden.results().filter(x => !x.pass), [])
// budget test: assert.deepEqual(rep.violations, []); assert.equal(rep.cpu.overrunFrames, 0); bound rep.cpu.busy.p95
```
Then add `"<name>": "tests/<name>.test.ts"` to `CHECKED_IN_GAME_TEST` in tests/golden-frames.test.ts
(it checks that your file calls `goldenRecorder("<name>")` and `.results()`).

## Clone before poking (tests/erg.test.ts)
```ts
clone(): Run {                                // loadState does not restore the picture or harness counters
  const c = new Run();
  c.m.loadState(this.m.saveState());          // same ROM bytes only: v2 states name their ROM
  c.m.framebuffer.set(this.m.framebuffer);
  c.pads = this.pads.slice(); /* copy every harness counter too */
  assert.equal(c.m.hash(), this.m.hash());
  return c;
}
let atPlay: Run | null = null;                // shared start for every test that begins at play
const fromPlay = () => { if (!atPlay) { atPlay = new Run(); atPlay.toPlay(); } return atPlay.clone(); };
```
Pin it once: a test that a clone and a fresh power-on run stay equal in hash, picture and
`audio.takeSamples()` over a stretch of play.

## Run-length pads
```ts
function runLength(pads: number[]): PadEntry[] {
  const out: PadEntry[] = []; let last = -1;
  pads.forEach((p, f) => { if (p !== last) { out.push([f, p, 0]); last = p; } });
  return out;
}
```

## Recording behind a flag
```ts
if (process.env.NAME_WRITE_REPLAY) await recordReplay("<name>", runLength(pads), pads.length,
  { addr: 0x8000, value: ST.win, note: "<what the run does, in one sentence>" });
const rep = JSON.parse(readFileSync("replays/<name>.replay.json", "utf8")) as ReplayFile;
assert.equal(rep.romSha256, sha256(rom)); assert.deepEqual(rep.pads, runLength(pads));
assert.equal(rep.frames, pads.length);    assert.equal(rep.expect.hash, hash);
```
The assertions after the write make the test fail (not re-record) when the ROM or the route
changes and nobody set the flag.

## Route player shape (tests/erg-route.ts)
- `pad(m, sym)` returns the next frame's pad from the machine state after the previous frame.
- State kept in the player: current state and frames in it (`menuT`), stage, next trigger index,
  the action in progress. `clone()` copies all of it (the search snapshots players with states).
- Routes live as strings in the test's route file (`ROUTES`), parsed by `parseRoute`; the search
  tool rewrites that one constant with `--write`.

## Raster-timing probe (tests/erg.test.ts `SplitWatch`)
A `Tally` subclass whose `reset`/`step` wrap the bus so `write16` to the watched register records
`{ mc: machine.masterCycle, v }` before passing the write on. Per write: line =
`floor((mc mod (262 × MASTER_PER_LINE)) / MASTER_PER_LINE)`, dot = `(mc mod MASTER_PER_LINE) / 4`;
require line = split line and dot ≥ 256 for every visible-line write.
