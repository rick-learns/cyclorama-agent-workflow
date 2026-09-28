---
name: cyc-name-clearance
description: Web-search clearance for every new Cyclorama fiction name or design before it is used or registered (game titles, characters, enemies, companies, publications, people, songs, slogans, collector terms, product names). Use whenever a new proper noun, character design or signature mechanic is proposed, or when checking whether existing fiction collides with real IP.
---

# Name and design clearance

MISSION.md forbids real or trademark-confusing IP inside the fiction. Needing such content is a
HALT condition. The human accepts renames when a collision is found (memory note "IP caution for
names"). So **search before use**, present any collision, and **recommend a cleared alternative**.

## Pipeline (per wave, so searches never stall the work)
- **Ledger first, search second.** Before searching, look the name up in the clearance log
  (`history/MARKETING_RESEARCH.md` §4 and its §4a) and in DECISIONS.md (`grep -n "<Name>"`). A
  name already judged is never searched again; cite the earlier verdict.
- **One clearance agent per wave.** Builders and historians *propose* names (with 2–3 fallback
  candidates each) in their reports; the lead batches them to a single clearance agent (the
  `cyc-canon-registrar` role preloads this skill) that searches serially, a few seconds apart.
- **Fallback provider.** When WebSearch rate-limits or errors, switch to the brave-search MCP tool
  (`mcp__brave-search__brave_web_search`, load it with ToolSearch), then retry WebSearch later.
  Brave also rate-limits parallel calls and often returns nothing for exact quoted phrases, so
  run it serially and don't read an empty result as clear. Record which provider produced each
  result, and cite results by name (the nearest hit and why it is not confusable).
- **Explicit UNCLEARED.** A name whose searches did not all run is `UNCLEARED`: it may appear in
  drafts only with that marker (e.g. `HOUSELIGHTS [UNCLEARED]`), never in canon, player-facing
  text, commit subjects or anything public. List UNCLEARED names in the report and in the log with
  verdict `UNCLEARED (searches incomplete: <which>)`; the lead or curator re-queues them next wave.
  Working titles in concept scenes, design docs and lineup proposals are UNCLEARED until searched:
  three of the concept scenes' titles collided (Undercroft, Nightrun Circuit, Prism Drift).
- **Clear before the build, not after.** Every player-visible name of a game (title, stages,
  songs, achievements, enemies) goes to the clearance agent at dispatch: song titles are ROM
  bytes, and a late rename means re-recording the replay (skill `cyc-completion-route` §0).

## Procedure (per name)
1. Check the clearance log and DECISIONS.md (above), `canon/canon.json` `denylist.terms` and
   existing canon names for clashes with our own entities.
2. Web search (WebSearch, or the brave-search fallback). Run the exact quoted name plus
   each relevant domain:
   - `"<Name>" game` / `video game` / `Steam` / `itch.io`
   - `"<Name>" console` / `electronics` / `toy` / `board game`
   - `"<Name>" magazine` / `band` / `film` / `TV` / `book` (for publications, songs, slogans)
   - `"<Name>" trademark` (for company and product names, and anything that might sell)
   - For characters, also search the **combination** of name, role and look (e.g. name +
     "astronaut" + "robot companion").
   - Always also search the **name alone** and `"<Name>" trademark OR Steam OR itch.io`. A
     domain-filtered search alone missed an itch.io game (Kitebird). Expect most dictionary and
     coined words to be taken by a game, app or electronics brand: keep 3+ candidates per slot.
     Light/lamp/glow/beacon/harbour coinages are crowded; theatre-craft terms (flyloft,
     proscenium) and other crafts' trade terms (lightfast, wick) clear far more often.
   - Search the **reversed word order** ("Fire Curtain" is clean, "curtain fire" is a shmup genre
     term) and the product classes next door to games ("Tidelamp" hits a real lamp product).
   - **Short evocative phrases** used as song or achievement titles collide more than game
     titles ("After the Show", "Encore! Encore!", "The Usher's Waltz" all collided); a coined
     combination with a game noun ("The Sconce Waltz", "Last Lamp Out") clears at once.
   - **Slogans and multi-word marks:** check each distinctive **word** against known marks, not
     only the whole phrase ("Only on the Cyc." has no slogan collision, but "Cyc" is Cycorp's
     registered mark).
   - Foreign-language names need a **meaning** check too: "demi-teinte" is clean but means a
     lukewarm reception in French games press.
   - Company names from Japanese surnames often collide with anime/game characters or voice
     actors (Hanamori, Nagisawa). Also check near-spellings of real conglomerates (Sumitaka ≈ a
     real "Sumi… Electric").
   - For publications and companies, check the **city** too: a real publisher's town plus a
     similar profile reads as a portrait (Full Beam moved from Bath to Norwich).
   - **Model, catalogue and document numbers** (CY-, CYC-, CYK-, HED-): one quoted query per
     number plus one combined `"<A>" OR "<B>" product code` query is enough; the nearest hits
     were stage "cyc" lighting fixtures (CYC-1001/1003, `history/MARKETING_RESEARCH.md` §4).
3. Judge confusability, not just exact matches:
   - **REJECTED:** the same or a near name in games, electronics, toys or media, or a registered
     mark in those classes, or a crowded name space.
   - **REJECTED (slogans):** a generic line that fits any lamp or camera brand (crowded, and here
     it also reads as Avenell's lighting business, not the console); a line that echoes a famous
     registered tagline in any class ("Where light goes further." vs Ford's "Go Further"). Naming
     the product in the line ("… on the Cyclorama.") makes it hard to confuse.
   - **CAUTION:** usable with a stated limit, e.g. in-fiction only, never commercial.
   - **CLEARED:** only unrelated uses, or a generic dictionary or technical term in a different
     field. Ordinary personal names are cleared when no *notable* person in games or media
     shares them.
4. Record the evidence:
   - Lead/canon names: one DECISIONS.md line, e.g.
     `- YYYY-MM-DD [canon/M4] Names cleared by web search: "X" rejected (<collision>); "Y" adopted — <nearest hit and why it is not confusable>.`
   - `history/` names: the clearance log table in `history/MARKETING_RESEARCH.md` §4
     (Name | Query | Result | Verdict).
5. Present collisions to the human with a recommended cleared option. Register in canon only
   after clearance (skill `cyc-canon`).
6. If a real name keeps creeping into drafts, propose adding it to `canon.json` `denylist.terms`
   in its brand form (matching is case-sensitive, whole word).

## Worked examples (from DECISIONS.md and history/)
See [examples.md](examples.md) for the full table. Short version:
- Footlight: rejected (a real performing-arts "Footlight Console"). Lampwright: rejected
  (≈ Gamewright Games). Lanthorn: rejected (an existing interactive-fiction player).
  → Avenell, Cyclorama, Tally, Barndoor, Cue and SCRIM were adopted.
- Joule: rejected (ReCore's Joule Adams, a space explorer with glowing-core robots, would make
  astronaut + robot confusable). → **Erg** was adopted.
- Orbit Breaker: rejected (a Steam game and a browser game). → **ERG: NIGHTSIDE RUN** was
  adopted (nearest hit, the 2015 RTS *Nightside*, is a different title and genre, and
  "nightside" is an astronomy term).
- Candlewick Keep: rejected (≈ Candlekeep). Lamplighter's Round: rejected (crowded, incl.
  *The Lamplighters League*). → SHADEWORKS and HOUSELIGHTS cleared.
- Peeper → **Gogglet** (Peeper is a creature in *Subnautica* and *R.E.P.O.*).
- Rivals: Ondaka, Hanamori, Kitebird, Corvane, Vireo, Longview and others rejected →
  **Takumori Merrybox** and **Tessford Oakrunner** adopted (history/MARKETING_RESEARCH.md §4a).
- "Cyc": Cycorp's registered mark. Only fans and journalists say "the Cyc" inside the fiction;
  Avenell's own voice (ads, boxes, letters, brief copy lines) always says "the Cyclorama". The
  owner rejected the slogan "Only on the Cyc."; "Light does more on the Cyclorama." replaced it,
  and `checkExtended` rejects any slogan containing "Cyc". Grep briefs' quoted copy for it too.
- "Terminator Line" (ERG title tune) → **RIM OF NIGHT** (an itch.io jam game); "Ember Foundry"
  CAUTION, in-fiction stage name only (Foundry VTT's RPG "Ember").

## Design rules (avoid identifiable signatures, not just names)
- No ring collectibles or ring trails. Energy is a lamp/battery meter; pickups are **glow motes**
  (each one a light-field light).
- No springs of the famous kind. Use **bioluminescent mushroom bounce pads**.
- No glowing belly-core robots. Robots get **lamp-eyes**.
- No speed-hero + ring trail + zone formula taken as a package.
- Maze games: no pellets, no ghost pens, no chasing-ghost quartet. HOUSELIGHTS is an usher
  relighting a dark theatre.
- Open-source games inspire **mechanics and design lessons only** (research/game-design-survey.md):
  never port, rename or reuse their code, assets, level data, names or text.
- No quality seals, four-critic score panels, rival-naming slogans, mascot-with-attitude ads or
  black box-art grids (history/MARKETING_RESEARCH.md §3).
- Product details can be signatures too: a cartridge slot with spring-loaded twin dust flaps
  reads as a real console (CY-1's flaps became side-hinged and hand-opened). Say what makes each
  design different.
- No real people, retailers, magazines, consoles, CPUs or trade shows inside in-world artifacts.
  Say "the June electronics show", not its real name.

## Don't
- Don't register a name before it is cleared.
- Don't treat "no exact match" as clearance when a near variant is a game or brand.
- Don't clear by memory: run the searches and cite what they found.
- Don't assume a name is clear when searching stopped early (rate limits hit mid-batch): mark
  it **UNCLEARED** (pipeline above) and finish it next wave.
- Don't mistake this for legal clearance: official trademark databases block automated access
  (HTTP 403), so web search is only a pre-screen. Anything commercial needs an attorney search
  (skill `cyc-licensing-and-release`).
