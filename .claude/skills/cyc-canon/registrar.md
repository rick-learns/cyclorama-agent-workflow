# Canon registrar reference

Detail for step 2–3 of the PROPOSED CANON flow in [SKILL.md](SKILL.md). Precedent: the first
registrar review of `history/PROPOSED_CANON.md` (DECISIONS 2026-09-26 [canon]).

## Entry shapes
- **Ids:** `pc-nnn` or `pc-nnn-suffix` for registered proposals, after their PROPOSED_CANON
  number (`pc-040`, `pc-060-uk-farewell`); their `source` must cite `history/PROPOSED_CANON.md`.
  Entries that are not proposals use a readable prefix (`rival-takumori`, `fin-hed-results`).
  Ids are unique across core **and** extended.
- **Provenance:** every entry has a `source`; a built game cites `rom` instead.
- **Several dated facts on one entry** go in an `events: [{ "date": …, "event": … }]` array
  (model: `pc-040`, the US regional rollout), so every date is validated.
- **Prices** are objects `{ "amount": <integer cents>, "currency": "USD" | "CAD" | "GBP" }`.
- **References** (`parent`, `maker`, `employer`, `magazine`, `distributor`, `agency`, `club`)
  must name a registered id.
- **Rivals:** a `competitor company` entity plus a `competitor console` entity whose `maker` is
  that company and whose `launches[]` all predate 1994-06-30 (`rival-takumori` +
  `rival-merrybox`, `rival-tessford` + `rival-oakrunner`).
- **Untitled game slots:** `title: null` is allowed only with status `legendary` or
  `unreleased prototype`.

## What `checkExtended` (tools/canon/lib.ts) enforces
- unique ids (core + extended); a `source` or `rom` on every entry; the `pc-` id and source
  pattern;
- calendar-valid dates (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) under any key in `DATE_KEYS`, at any
  depth, and start/end order for the pairs in `SPANS`;
- prices: positive integer cents in USD, CAD or GBP;
- references resolve; Avenell-affiliated dates not before the company was founded; people at
  least 14 when they join;
- products (`accessory`, `retail display`, `chip revision`, `regional hardware variant`)
  introduced within the console's life;
- `regional-price-history`: a launch region, that region's currency, after its launch, before
  discontinuation;
- competitor consoles: maker is a `competitor company`, launches before 1994-06-30;
- untitled games only as legendary/prototype.

**A new date field name must be added to `DATE_KEYS`** (and a new span to `SPANS`), or its values
go unchecked. Add a seeded-contradiction test in `tests/canon.test.ts` for any new rule.

## Pitfalls
- **Registered values are accepted in all prose.** Register the facts an artifact prints; defer
  statistics (sales by year, budgets, headcounts, placement or liquidation counts) until an
  artifact needs them.
- **Tests pin non-canon values.** `tests/canon.test.ts` and `tests/manual.test.ts` use
  US$199.99 as a known *wrong* price. Before registering a price, grep the tests for it
  (`grep -rn "199\.99" tests/`); never register one they pin as non-canon.
- **Facts about an unbuilt game** (pack-in status, catalogue number, sales) wait for that game's
  integration. Register only the scheme and the numbers of registered games (CYC-1002 SHADEWORKS
  in pc-036 `assignments`; CYC-1001 ERG and CYC-1003 HOUSELIGHTS later as their own
  `pc-036-cyc-100n` entries, kind `catalogue assignment`). Read catalogue numbers through
  `catalogueNumbers(canon)` in tools/canon/lib.ts, never from pc-036 `assignments` alone.
- **Hardware as sold** (regional boards, revisions, accessories) is checked against HED-0041's
  wording, not only the spec: e.g. the PAL UK board needs its own encoder-only subcarrier crystal
  (the master clock is not a PAL multiple), stated so "all timing from one crystal" still holds.
  Quantified claims about real tools (e.g. a compiler speed-up) would bind the real code:
  describe them qualitatively.
- **Core numbers:** a proposal that defines or re-scopes a core figure (e.g. what "sold" means in
  the 2.4M) is escalated to the human as one yes/no question, never registered.
- **Register the invariant, not the table.** When a working table must sum to core totals and
  match dated statements, register what must hold: `pc-056` carries
  `netShipmentsAtDiscontinuation` + `includes` (the lot id with `consoles`), and the checker
  requires shipments + lot = the core total and each dated `claimed` / `claimedMoreThan`
  statement to be true on its date. Yearly rows stay deferred until an artifact prints them.
- **Seeded-contradiction tests assert patterns, not counts:** a new check keyed on core values
  adds problems to existing seeded mutations ("detects inconsistent structure" counted exactly).
- **Human decisions** go to the human the same way (as with the 1992 "Cyc" slogan, now ruled).
