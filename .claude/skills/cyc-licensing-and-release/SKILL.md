---
name: cyc-licensing-and-release
description: Licence tiers, SPDX headers, brand rules and the public-release gate for the Avenell Cyclorama repo. Use when creating a new source file or folder (to pick its tier and header), when open code might depend on closed code, when anything touches the brand (names, logos, Curtain Up, "official", "Cyc"), or before anything is published, uploaded, posted or sold.
---

# Licensing and release

Authorities: `LICENSING.md` (the path → tier map, the source of truth), `TRADEMARKS.md`,
`NOTICE`, `CONTRIBUTING.md`, `docs/RESTRUCTURE_PLAN.md`, `docs/business/*.md`. Human decisions
D1–D3 and D-L4 are recorded in DECISIONS.md (2026-09-26 [licensing]) and LICENSING.md
"Resolved decisions".

## Tiers
| Tier | Licence | Covers (examples) |
|---|---|---|
| OPEN-CODE | Apache-2.0 | `src/isa`, `src/hw`, `src/asm`, `src/machine`, `src/scrim`, reference player (`src/web/player.ts`, `main.ts`, `input.ts`, `pacing.ts`, `resample.ts`, `audio-out.ts`), debugger **logic** (`src/web/debugger/session.ts`, `views.ts`), SDK tools, build/test tooling, conformance ROMs, open demo carts (`roms/lantern-test`, `roms/sound-test`) |
| SDK runtime | Apache-2.0 WITH LLVM-exception | code compiled into ROMs: `roms/lib/*` **except Curtain Up**, and `src/scrim/runtime.inc` (D1) |
| OPEN-SPEC | CC BY 4.0 | HED-0041 manual text, `docs/spec-notes.md`, `docs/scrim-spec.md`, policy text |
| BRAND | not licensed | AVENELL, CYCLORAMA, AVENELL CYCLORAMA, OFFICIAL CYCLORAMA; logos and wordmarks; **Curtain Up** splash and chime (`roms/lib/curtainup.*`); trade dress; the real-world brand kit `brand/` (skill `cyc-brand-mockups`) |
| FIRST-PARTY GAMES | all rights reserved | `roms/shadeworks/`, `roms/erg*/`, `roms/houselights/`, all future titles, their replays |
| OFFICIAL APP | all rights reserved | museum UI (`src/web/museum*.ts`, `tools/build-museum.ts`, `museum/catalog.json`), debugger UI, `src/app`, CRT, achievements, desktop shell |
| ARCHIVE | all rights reserved | BIBLE.md, canon lore (everything in canon.json except schema, `core.hardware`, `core.signatureBehavior`, `denylist`), `history/`, M5 artifacts |
| RESEARCH/INTERNAL | not distributed | `research/`, `docs/business/`, `MISSION/STATE/DECISIONS.md`, `.claude/`, `tools/scene/` |

A new path goes into the LICENSING.md path map **and** `tools/licence-tiers.ts` (the same map as
data) in the commit that creates it; `tests/licence-tiers.test.ts` fails when the two differ.

## Rules
- **Open never depends on closed.** Nothing in an OPEN tier imports, `.include`s or requires
  BRAND, FIRST-PARTY GAMES, OFFICIAL APP or ARCHIVE files. Closed may depend on open.
  `tests/import-boundaries.test.ts` rule 5 checks it (.ts imports, CYASM `.include`/`.incbin`,
  SCRIM `INCLUDE`/`LINK`/`ASSET`) against the tiers in `tools/licence-tiers.ts`; it found 8 open
  → closed edges at d80d9fa. A tolerated leak goes into its `TIER_ALLOW` with a reason, and a
  stale allow entry fails the test.
- **Copyright licences never grant trademarks** (Apache-2.0 §6, CC BY 4.0 §2(b)(2)).
- **Curtain Up is BRAND.** Only first-party cartridges show it. Homebrew and open demos may not,
  and they show no splash at all: no neutral SDK splash is planned (DECISIONS 2026-09-27
  [licensing]; `roms/sound-test` dropped Curtain Up, and `TIER_ALLOW` is empty). The emulator,
  reference player and official app **must never check for, require or reward** the splash or
  any mark in order to run a ROM. This is a permanent design rule (TRADEMARKS.md, the Sega v.
  Accolade reasoning).
- **Debugger:** logic open, UI closed (D2).
- **"Cyc"** is Cycorp's registered mark. It may appear in fiction as the fans' nickname, never
  as a product, app, domain, handle or slogan. "Curtain Up" is a common phrase: keep it an
  internal/in-world label, not a lead word mark.
- **"Erg"** in real-world products: Concept2 holds RowErg, SkiErg, BikeErg, ErgData and ErgRace
  (fitness goods, apps). Avoid "-Erg" compound product names and flag class-28 merchandise for
  the attorney. Keep the helmet mascot clear of Astro Bot, Ludens and the Among Us crewmate
  (brand/BRAND_KIT.md §3). (until an attorney search replaces the pre-screen)
- **AI-drafted logos** are drafts: a human designer redraws them under a written assignment
  before any filing (copyright in AI output is limited; trademark rights come from use).
- **Copyright holder: `rick-learns`** (D3, owner 2026-09-27; final): NOTICE, the site footer,
  the docs footer and every SPDX line (one constant, `HOLDER` in `tools/licence-holder.ts`; a
  test pins them equal). Never use "Avenell Stagecraft Ltd." as the real entity.
- **A published copy of a committed artifact** (the manual on the website) adds only a site
  frame between `<!--site:begin-->`/`<!--site:end-->` markers (`tools/build-site-docs.ts`); a
  test strips them and requires the committed file byte for byte (tests/site-docs.test.ts).
- **A build that publishes a source verbatim drops its SPDX lines** (manual fragments via
  `fragmentSource()`, example listings in `renderExample`, site partials, brand `page.css`), or
  the in-world page and hash-pinned shots change (tests/manual-av.test.ts, brand shots.json).
- **Site CSP** (`site/_headers`, pinned by tests/site.test.ts and site-integration.test.ts): a page
  running src/web/player.ts needs `blob:` in script-src (the AudioWorklet loads from a blob: URL;
  without it sound silently falls back to ScriptProcessor). The only off-site hosts allowed are
  Cloudflare Web Analytics (script `https://static.cloudflareinsights.com`, connect
  `https://cloudflareinsights.com`; owner decision 2026-09-27), and the page must disclose it.
- Contributions to open tiers are inbound = outbound (Apache-2.0 / CC BY 4.0) with DCO
  `Signed-off-by` (CONTRIBUTING.md).

## SPDX headers (every source file; verify step 8, `tools/spdx-lint.ts`)
Two comment lines in the file's own syntax, after a `#!` or `<!doctype html>` line if any
(LICENSING.md "SPDX headers" is the authority):
```
// SPDX-FileCopyrightText: 2026 rick-learns
// SPDX-License-Identifier: Apache-2.0
```
- Identifier by tier: `Apache-2.0` (OPEN-CODE), `Apache-2.0 WITH LLVM-exception` (SDK runtime),
  `CC-BY-4.0` (OPEN-SPEC), `LicenseRef-Cyclorama-Proprietary` (every closed tier). Syntax: `//`
  .ts/.js, `/* */` .css, `<!-- -->` .html, `;` .asm/.inc/.art/.song, `--` SCRIM, `#` shell/YAML.
- **A new file:** tier its path in LICENSING.md and `tools/licence-tiers.ts` together, then
  `node tools/spdx-lint.ts --fix` writes the header (`--list` shows each file's tier). The lint
  was red on 344 files at the rollout.
- Exempt (the path map alone licenses them): JSON, `.md` prose, binaries, licence texts, NOTICE,
  `.nvmrc`, generated files, and the Curtain Up files, which open with a plain brand notice.
- **Comments must not change ROM bytes.** After adding headers to `.asm`/`.inc`, run
  `node tools/build-roms.ts` and `node --test tests/build-roms.test.ts`. The manifest SHA-256s
  must be unchanged.

## Publishing
**The human gives an explicit go** for each specific public step. Never publish, upload, push to
a public remote, post or open a store page on your own initiative. (The monorepo's full release
checklist and launch plan are private and not part of this copy.)

**Honesty rule everywhere:** in-universe framing only inside a visible "alternate-history
fiction" frame. The hook is "the console never existed, but the hardware is real." Backers' real
names go in real-world credits only.
