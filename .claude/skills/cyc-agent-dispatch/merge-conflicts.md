# Resolving merge conflicts (detail for [SKILL.md](SKILL.md) "Integration", steps 3 and 5)

After `git merge --no-ff --no-commit <branch>`, resolve conflicts by hand:
- **Shared files keep both sides:** `package.json` scripts, the `tools/verify.ts` steps,
  `tools/build-roms.ts`, `LICENSING.md` path map, tests that import shared hooks.
- **Catalogs union by key:** `museum/catalog.json` and `app/catalog.json` by `rom`,
  `app/achievements.json` by cartridge key, keeping every entry from both sides; then check
  every accepted game is in both catalogs (SHADEWORKS was missing from the app catalog).
  A shared test both games edited (tests/app.test.ts) keeps the data-driven version.
- **`DECISIONS.md` is append-only:** keep both sides in order; delete only the markers.
- **Generated files: never hand-merge; regenerate after the merge.** `roms/manifest.json`:
  take either side, `node tools/build-roms.ts --write-manifest`, check the diff touches only
  expected ROMs. `tests/golden/frames.json` and PNGs: take either side, then
  `npm run golden -- --update` once every merged replay is present; only the merged games'
  entries may change. A replay whose ROM changed in the merge is re-recorded from its test
  (skill `cyc-completion-route` §5), never edited.
- **Two games in one wave:** merge the first; tell the second to `git merge --no-edit main`
  and regenerate on its branch, or do the union and regeneration yourself in the merge.
- `STATE.md`, `DECISIONS.md`, `canon/canon.json` belong to the lead: keep main's version and
  apply the agent's intent yourself.

## Pushing
- After every push of main run `node tools/checkout-lock.ts pushed <merge-sha>` (default HEAD):
  it fetches origin, exits 0 only if the commit is an ancestor of origin/main, and warns when
  the shared checkout is not on main. Never report a merge as landed on a non-zero exit
  (4dba17e, c020d1d).
- In zsh quote refspecs that follow a variable (`git push origin "$B:refs/heads/x"`: `$B:r` is
  a zsh modifier).

## Fallback
Branch can't be merged (e.g. nothing committed): on a new `<type>/<topic>` branch, copy files
from `.claude/worktrees/agent-<id>/…` by explicit path after `git diff --stat <base> HEAD -- <files>`,
regenerate the manifest and golden frames, commit there, then merge that branch with the same steps.
