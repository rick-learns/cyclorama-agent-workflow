---
name: cyc-brand-history
description: The Brand, Marketing & Cultural History Director role for the Avenell Cyclorama archive (history/). Use when commissioning or doing in-universe brand, marketing, sales, press, legend or cultural-history research; writing artifact briefs or sample documents for M5; extending history/PROPOSED_CANON.md; or keeping real-world launch messaging separate from the fiction.
---

# Brand, Marketing & Cultural History Director

The full tuned brief for an agent in this role is in [director-brief.md](director-brief.md).
Dispatch it with skill `cyc-agent-dispatch`. This page is the lead's summary and the rules to
check deliverables against.

## What exists (history/, ARCHIVE tier, landed 2026-09-26)
| File | Holds |
|---|---|
| `BRAND_BIBLE.md` | the one idea; the four voices (corporate, trade, product, Playhouse, plus Avenell's and Marchand's personal voices); names, wordmarks, colour, type, numbering, packaging, labels, slogans; claims allowed and never allowed; regional variation; the quality test (§12) |
| `MARKET_HISTORY.md` | the commercial story 1985–1994+, year by year, the five failure causes connected |
| `SALES_MODEL.md` | the reconciled model: canon (C), proposed (P) and working (W) numbers, all summing to the canon 2,400,000 |
| `PUBLICATIONS.md` | fictional press: *Cartouche*, *Cartridge Monthly*, *Full Beam*, *Counterline*, *Prompt Corner*, *The Ninth Plane*, *Lamp Check*; review conventions; a cross-source disagreement matrix |
| `CAMPAIGN_TIMELINE.md` | every marketing event dated, mapped to briefs |
| `CULTURAL_HISTORY.md` | the "lights off" ritual, owners, communities, the reputation arc, after 1994 |
| `LEGENDS.md` | rumours tagged **TRUE / PARTLY TRUE / FALSE**, with canonical truth, evidence, and who believed it and when |
| `MARKETING_RESEARCH.md` | real sources → extracted patterns; patterns NOT borrowed; the **name-clearance log** (§4; rivals §4a) |
| `PROPOSED_CANON.md` | PC-001… additions, each REQUIRED/RECOMMENDED/OPTIONAL/CHOICE with the exact JSON shape |
| `briefs/NN-*.md` | 29 artifact briefs mapped to M5 deliverables |
| `samples/*.md` | evidence-density exemplars (trade announcement, dealer sheet, dealer bulletin) with an out-of-world header |
| `REAL_WORLD_LAUNCH.md` | **out of world**: real positioning and honesty rules. Never fiction, never canon-scanned |

## Rules to enforce
- **Archive density over lore.** Artifacts feel mundane, specific and cross-referenced: document
  numbers, dates, SKUs, prices, signatures, small facts that another artifact independently
  confirms. No epic backstory, no winks.
- **Period voice** (BRAND_BIBLE §1, §10): know nothing after the artifact's date. No "retro",
  "gamers", "immersive" or "content". At most one stage word per consumer piece, and no curtain
  puns.
- **Rivals:** the registered **Takumori Merrybox** (8-bit market leader) and **Tessford
  Oakrunner** (16-bit, 1990-09) may be named by period magazines and trade papers. **Avenell's
  own voice never names a rival.** Takumori's 1991 successor stays unnamed; rival designs,
  controllers and mascots are undefined (skill `cyc-canon`).
- **Proposed canon only.** Agents never edit `canon/canon.json`. New facts go into
  PROPOSED_CANON.md as `PC-nnn`. An artifact that depends on an unregistered PC entry is not
  final. Registration is the lead's job (skill `cyc-canon`). After the first registrar review
  (DECISIONS 2026-09-26 [canon]) 51 entries are registered as `pc-nnn` ids, including the
  legendary cart (PC-060 A) and prototype (PC-061 A) as untitled game slots; PC-043, 046–049 and
  064 are deferred until an artifact prints them; the owner ruled on PC-056 and the 1992 slogan
  (skill `cyc-canon`).
- **Document numbers are canon too.** HED-nnnn is the Home Entertainment Division series (from
  1986): never give an earlier event one. Use neutral tags or registered numbers (also on the
  real-world site's timeline, skill `cyc-brand-mockups`).
- **Propose only what an artifact prints.** Every registered date or price becomes legal in all
  prose, so speculative statistics (sales by year, budgets, headcounts) wait for the artifact
  that needs them.
- **Name clearance** for every proper noun, logged in MARKETING_RESEARCH.md §4 (skill
  `cyc-name-clearance`). Avenell's own voice says "the Cyclorama", never "the Cyc"; grep
  briefs' quoted copy lines for it. Check a publication's or company's **city** as well as its name, and say
  what makes any product design differ from a real one.
- **Sales model constrained to canon:** lifetime 2,400,000 (CA 350,000 / US 1,550,000 / UK
  500,000). Prices and dates are fixed by core canon. Every derived number traces to
  SALES_MODEL.md.
- **Briefs** carry: MAPS TO, DATE, AUDIENCE, PURPOSE, VOICE, CANON FACTS USED, NEW CANON
  REQUIRED, VISUAL DIRECTION, COPY DIRECTION, CLAIMS ALLOWED, CLAIMS PROHIBITED, QUALITY TEST
  (plus GAME-QUALITY FACTS FROM THE BUILT GAME for any game campaign).
  - **Game campaigns are written only after the game exists and has been playtested.**
  - Claims must match the ROM.
- **Legends** are tagged TRUE / PARTLY TRUE / FALSE. A legend may never imply hardware that
  HED-0041 and the emulator don't support. The archive must let a careful visitor catch every
  FALSE one.
- **Real-world launch messaging stays separate** (`history/REAL_WORLD_LAUNCH.md`,
  `docs/business/`). Nothing fictional is presented as real fact, and nothing real enters the
  fiction.
- Visuals must be reproducible from repo source (SVG/CSS/Canvas/pixel data). No real logos,
  fonts named in artifacts, trade dress, seals or box-art grids.

## Reviewing a deliverable
1. Sample 5 numbers and trace each to canon or SALES_MODEL (C/P/W).
2. Sample 5 names and check each against the clearance log.
3. Read one brief against BRAND_BIBLE §12. Could Avenell have made it in its year? Is the only
   technical claim true?
4. Grep for real names and denylist terms.
5. Check that REAL_WORLD_LAUNCH.md and docs/business remain the only out-of-world files, and
   that they are excluded from any canon scan (RESTRUCTURE_PLAN §5).
