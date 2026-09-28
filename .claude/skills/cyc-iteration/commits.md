# Commit messages in detail (for [SKILL.md](SKILL.md) §4 "Message")

Conventional Commits 1.0, checked by `tools/commit-msg.ts` (the `commit-msg` hook, CI's `lint`
range, and by hand: `node tools/commit-msg.ts <message-file>`, `--range main..HEAD`).

## Example
```
feat(erg): add the dawn stage

Stage 3 scroll split at line 96; replay re-recorded from its test.

Milestone: M5
Verified: erg.test.ts 14/14 pass, replay f3aa5734 (10,162 frames)
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Rules beyond the header
- The trailers are the **last paragraph**: `Milestone: M<n>` (optional), `Verified: <observed
  result>` (required for feat, fix, perf and canon), then Co-Authored-By from the session's
  attribution instructions. A `Verified:` line outside that block fails the lint (d78be602).
- `Verified:` states what was observed (counts, pass, a hash), never the command alone.
- Breaking: `!` after the type/scope, or a `BREAKING CHANGE:` footer.
- Exempt subjects: git's own "Merge …", "Revert …", "fixup!/squash!/amend!". Integrator merges
  keep "Merge branch '…'" and the body names what landed with its evidence.
