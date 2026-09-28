// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: LicenseRef-Cyclorama-Proprietary
//
// node .claude/skills/cyc-show-human/shoot.ts [--page build/museum/index.html] [--rom <name>]
//      [--frames N] [--press Key@frame ...] [--out .tmp/shot.png] [--canvas]
// Full-page Playwright screenshot of a REAL build (museum by default) for showing the human.
// With --rom it clicks that cartridge on the shelf, then waits until the machine has run
// N frames (default 240), pressing each Key (a KeyboardEvent.code: Enter, KeyZ, ArrowRight...)
// once the machine frame counter reaches its @frame. --canvas shoots only the 256x224 screen.
// Evidence rule: this renders the real ROM through the real emulator; never edit the PNG.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const page = opt("--page", "build/museum/index.html")!;
const rom = opt("--rom");
const frames = Number(opt("--frames", "240"));
const out = opt("--out", ".tmp/shot.png")!;
const presses = args.flatMap((a, i) => (a === "--press" ? [args[i + 1]] : []))
  .map(p => { const [key, at] = p.split("@"); return { key, at: Number(at ?? 0) }; })
  .sort((a, b) => a.at - b.at);

const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const p = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors: string[] = [];
  p.on("pageerror", e => errors.push(String(e)));
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(/^https?:/.test(page) ? page : pathToFileURL(resolve(page)).href);
  if (rom) {
    await p.click(`.cart[data-rom="${rom}"]`);
    const frameNow = () => p.evaluate(() => (window as any).__museum?.frames ?? 0);
    for (const { key, at } of presses) {
      await p.waitForFunction(n => ((window as any).__museum?.frames ?? 0) >= n, at, { timeout: 60_000 });
      await p.keyboard.down(key);
      await p.waitForTimeout(100);
      await p.keyboard.up(key);
    }
    await p.waitForFunction(n => ((window as any).__museum?.frames ?? 0) >= n, frames, { timeout: 120_000 });
    console.log(`frame ${await frameNow()}, hash ${await p.evaluate(() => (window as any).__museum.hash)}`);
  }
  mkdirSync(dirname(out), { recursive: true });
  if (args.includes("--canvas")) await p.locator("#screen").screenshot({ path: out });
  else await p.screenshot({ path: out, fullPage: true });
  console.log(`wrote ${out}${errors.length ? `\nconsole errors:\n  ${errors.join("\n  ")}` : ""}`);
} finally {
  await browser.close();
}
