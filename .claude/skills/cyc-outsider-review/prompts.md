# Reviewer prompts

## Outsider review (first pass)

> You are an experienced emulator and toolchain engineer. You have **only** this document:
> `<absolute path to the built artifact, e.g. docs/manual/index.html>`. Do not open any other file
> in the repository, and do not search the web for it. Your task: decide whether you could
> implement a **bit- and cycle-exact** <emulator and assembler | compiler | cartridge from these
> instructions> from it alone.
>
> Write `research/<name>-review.md`:
> - **BLOCKING** (B1, B2, …): places where two competent implementers following the text would
>   produce different machine state, bytes or cycle counts. Quote the section number and text,
>   and explain the divergence concretely (two readings, and what differs).
> - **MINOR** (M1, …): unclear but recoverable.
> - **Contradictions** (K1, …): two places that disagree, both quoted.
> - **Worked-example errors** (X1, …): recompute every example and encoding table row; report
>   mismatches.
> - Totals at the top. No fixes to the document: report only.
> Do NOT commit. Report the file path and the totals.

## Independent re-check

> You are a second, independent reviewer. You have **only** `<artifact path>` and
> `research/<name>-review.md`. Read no other file.
> For each item in the review, mark **RESOLVED** only if the artifact now fixes the behaviour so
> that two competent implementers working from the artifact alone produce the same state, bytes
> and cycle counts; otherwise **OPEN (narrow)** with the remaining gap and a one-sentence fix.
> Quote the text that resolves each item.
> Then list **new** problems the fixes introduced: contradictions or blocking gaps (N1…),
> ambiguities (…), and text-only inconsistencies (…).
> Write `research/<name>-recheck.md` with a summary table (items / RESOLVED / OPEN).
> Do NOT commit. Report the path and the table.

## Player-instructions review (games)

> You have only the text in `<museum/catalog.json entry or roms/<name>/README.md player section>`
> and may play the cartridge in `build/museum/index.html`. List every point where a first-time
> player would not know what to do, what a screen means, or how to win or lose, and every place
> where the text and the game disagree.
