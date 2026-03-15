# Script Review Fixes

## Fixed
- `mo update` / `mo upgrade` now directly run `scripts/apply-update.mjs` instead of nesting through `npm run update`.
- `mo patch` now directly runs `scripts/apply-patch.mjs`.
- Added `pack:patch`, `patch`, and `release` scripts to `package.json`.
- `pack-dev` and `pack-release` now include `RELEASE_NOTES.md` and `CHANGELOG.md` when present.
- `pack-dev` and update backup no longer sweep the whole `.updates/` tree, avoiding recursive or volatile archive content.
- `sync-structure.mjs` now creates patch outbox folders.
- `doctor.mjs` now checks `RELEASE_NOTES.md`.
- `apply-update.mjs` and `apply-patch.mjs` now print step logs for easier debugging.

## Recommended next use
1. Replace local `scripts/` and `package.json` with this patch.
2. Put release zip into `.updates/inbox/market-observer_release_latest.zip`.
3. Run `npm run mo -- update`.
4. Confirm new files appear in `.updates/repo-backup`, `.updates/bak`, `.updates/history`.
