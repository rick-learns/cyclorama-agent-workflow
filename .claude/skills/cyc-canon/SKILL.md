---
name: cyc-canon
description: Rules and procedure for Cyclorama canon (canon/canon.json + BIBLE.md). Use when adding a game, developer, magazine, person or other entity to extended canon, reviewing history/PROPOSED_CANON.md, writing any in-universe text (dates, prices, hardware claims, period voice), running npm run canon, or when implementation seems to contradict canon.
---

# Canon

`canon/canon.json` is the machine-readable source of truth. `BIBLE.md` is its human-readable
counterpart; if they disagree, canon.json wins and BIBLE.md is corrected.

## Two tiers
- **Core** (`core`): company, founders, people, console, launch dates and prices, price history,
  units sold (2,400,000: CA 350,000 / US 1,550,000 / UK 500,000), timeline, failure causes,
  hardware, the light field, techniques, cartridge generations, dev kit. **Immutable.** It changes
  only by a canon migration the human explicitly authorises.
- **Extended** (`extended.games`, `developers`, `magazines`, `people`, `entities`): **append-only.**
  A new entry may never contradict or alter core or any earlier entry.
- **Null means undecided** (`meta.tiers.extendedRules`): a later registration may fill a `null`
  field (e.g. a slot's title once the game is built and cleared); a non-null value never changes.
  A fact deferred "as a field on an existing entry" is registered later as its own suffixed entry
  (`pc-036-cyc-1001`, kind `catalogue assignment`), so no registered entry gains a field.
- If implementation contradicts canon, **the implementation changes**. If canon itself would have
  to change: HALT (skill `cyc-iteration`, condition 2). Write HALT.md with the smallest human
  decision.

## Registering a game (`extended.games`)
The model entry:
```json
{
  "id": "shadeworks",
  "title": "SHADEWORKS",
  "developer": "Avenell Playhouse",
  "publisher": "Avenell Stagecraft Ltd.",
  "released": "1987-09-18",
  "region": "CA",
  "genre": "puzzle",
  "technique": "Lantern",
  "language": "CYASM (direct assembly)",
  "status": "released",
  "rom": "roms/shadeworks/shadeworks.asm",
  "summary": "Light-mixing puzzle: steer up to four lamps until every gel cell reaches its target shade; over-lighting wraps back to black."
}
```
- `released` must lie within 1987-09-18 .. 1994-06-30 (the checker enforces this). Use ISO dates
  (`YYYY-MM-DD`, or `YYYY-MM` when the day isn't canon). The ROM header date must agree
  (`HEADER ... date = $19870918` in SCRIM, `.header` in CYASM).
- `technique` is one of core `signatureBehavior.techniques` and must fit the era: Lantern 1987,
  Gel swap 1989, Flying 1990–1991, Overdrive 1992, Follow-spot 1993–1994.
- `status`: `released`, or the prototype/legendary statuses M4 requires. Status affects
  presentation, never technical quality.
- `language`: `SCRIM` or `CYASM (direct assembly)`.
- Built games cite `rom`; everything else cites a `source`.
- **Pre-registered slots:** the legendary cart (`pc-060-uk-farewell`, status `legendary`) and the
  prototype (`pc-061-last-playhouse`, `unreleased prototype`) already sit in `games[]` with
  `title: null`. When the game is built, fill the nulls (title, rom, technique…) in place; never
  change their set fields.
- Before registering: clear the name (skill `cyc-name-clearance`) and record the decision in
  DECISIONS.md.

## PROPOSED CANON flow (history/ and other agents)
1. Agents never edit canon.json. They write proposals, e.g. `history/PROPOSED_CANON.md` entries
   `PC-nnn` with Fact, Rationale, Depends and Shape (the exact JSON), each marked REQUIRED,
   RECOMMENDED, OPTIONAL or CHOICE, with name clearance logged in
   `history/MARKETING_RESEARCH.md` §4.
   State (DECISIONS 2026-09-26 [canon]): registered as `pc-nnn[-suffix]` ids, PC-043/046–049/064
   deferred; the owner ruled on PC-056 (core "sold" = net shipments incl. the August 1994 lot,
   `pc-056`) and rejected "Only on the Cyc." ("Light does more on the Cyclorama." in `pc-050`);
   rivals registered (below). Agents outside history/ (planners, builders) keep proposals in
   their own file with local ids (`LP-D1…`); the lead moves them here, so parallel agents never
   conflict on PROPOSED_CANON.md.
2. The lead (or a canon-registrar agent reporting back to the lead) reviews each entry against
   [registrar.md](registrar.md):
   - Is it additive only? Does it contradict core or an earlier entry?
   - Is the name cleared? Is it **needed by an artifact now**?
   - Does a hardware-as-sold claim match HED-0041's wording, not just the spec?
   Reject, trim or defer freely. Choose one option for each CHOICE. Escalate anything that
   defines or re-scopes a core number, as one yes/no question for the human.
3. Register the accepted entries in the right `extended` array, keeping the shape. **Every date
   or price you register becomes "allowed" in all prose** (`canonDates` and `canonPrices` walk
   core and extended). Register only real facts an artifact prints, never convenience values or
   speculative statistics. Batch the registrations one artifact needs.
4. Run `npm run canon`. It must end with `canon: zero contradictions`.
5. Test: `node --test tests/canon.test.ts` (it seeds contradictions and requires detection). Add
   a seeded-contradiction case if you add a new kind of check.
6. Append DECISIONS.md: `- YYYY-MM-DD [canon] Registered PC-001..PC-0nn (<summary>); rejected PC-0xx (<reason>) — <why>`.
7. Commit canon.json, the DECISIONS.md line and any BIBLE.md mention together.

## What the checker scans (`tools/canon-check.ts`, `tools/canon/lib.ts`)
- `canon/canon.json` structure: timeline order; launches and discontinuation in the timeline;
  unit sums; clock/timing/palette/CRAM arithmetic; ≥3 techniques; no denylisted names; and
  `checkExtended` over every extended entry (ids, sources, dates, prices, references, product and
  competitor dates; details in [registrar.md](registrar.md)).
- `BIBLE.md`, with coverage: every core timeline date, **core** price, person, technique, and the
  unit figures must appear. Coverage is core-only; keep any new coverage rule core-only, or the
  first extended value breaks `npm run canon`.
- `docs/manual/index.html`: prose checks on the visible text, plus a denylist scan of the raw HTML.
- Prose checks: dates written "September 18, 1987" or "June 1987" must be canon dates; prices
  `US$179.99`, `CA$229.99`, `£149.99` or `$179.99` (a bare `$` counts only with cents; `$8000`
  is hex) must be canon prices; the denylist (case-sensitive, whole word); hardware claims
  ("256 × 224 pixels", "16 sprites per line", "four lights"...) must match; "Name (born YYYY"
  must match `people[].born`.
- **Not scanned yet:** `history/`, game READMEs, museum catalog text. (SHADEWORKS' test runs the
  denylist over its own player text; copy that pattern.) M5 widens the scan through an
  **allowlist of fiction roots** (docs/RESTRUCTURE_PLAN.md §5, `FICTION_ROOTS` / `NOT_FICTION`),
  never a blocklist.
- **Never scan real-world documents as fiction:** `docs/business/`, `docs/process/`, `research/`,
  `RESEARCH.md`, `MISSION.md`, `STATE.md`, `DECISIONS.md`, `LICENSING.md`, `TRADEMARKS.md`,
  `CONTRIBUTING.md`, `TESTING.md`, `history/REAL_WORLD_LAUNCH.md`, research logs with URLs. They
  name real companies and prices on purpose.

## Period voice (in-universe text)
- Know the artifact's date; know nothing after it. Name nothing real: no real consoles, CPUs,
  magazines, retailers, trade shows or people.
- **Rivals** are fictional and registered: Takumori Electric's 8-bit **Takumori Merrybox** (the
  market leader) and Tessford Computer's 16-bit **Tessford Oakrunner** (1990-09). Period
  magazines and trade papers may name them. **Avenell's own voice never names a rival** ("larger
  rival systems"). Takumori's 1991 16-bit successor stays unnamed; designs, controllers and
  mascots are undefined, so don't describe them. The human approved 1–2 invented rivals and both
  exist: invent no more without a human decision.
- Write dates as "September 18, 1987" so the checker can verify them; prices with their currency.
- Hardware claims must be true of the frozen spec (HED-0041, the emulator). No legend or ad may
  imply hardware that doesn't exist. More than four lights **per frame** is true (Flying); per
  line it is false.
- Avenell corporate voice: plain, exact, Canadian spelling (colour, centre, licence), no hype.
  Canadian consumer material is bilingual. Full voice rules: `history/BRAND_BIBLE.md` §1
  (skill `cyc-brand-history`). Avenell's voice never says "Cyc": only fans and journalists call
  it "the Cyc" (owner ruling; `checkExtended` rejects any slogan containing "Cyc").
- Technique names (Gel swap, Flying, Overdrive, Follow-spot) appear in consumer copy only after
  they are public in-universe.
- The museum must say plainly that it is alternate-history fiction, on entry and on its about
  screen.
