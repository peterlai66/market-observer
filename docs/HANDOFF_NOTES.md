## 0.19.13
- Fixed missing `buildMarketTimingHint()` helper in runtime so LINE `status` / `report` should no longer fail.
- Added strict non-trading-day guard for `push-only`; weekend ticks now skip summary pushes unless a latest completed trading-day summary is actually aligned.
- Still needs remote/user validation on deployed LINE and weekend cron behavior.

## 0.19.12
- Latest confirmed local/dev version in the user's uploaded package: 0.19.12.
- The next assistant must begin by reading this uploaded dev package, not by assuming prior release state.
- Immediate carry-forward issues from user validation:
  1. `status` / `report` LINE replies can fail with `buildMarketTimingHint is not defined`.
  2. A weekend 16:00 push incorrectly emitted `台股盤後總結（2026-03-14）` on Saturday.
  3. User wants MO to learn/communicate normal daily source-ready windows and expected analysis/recommendation availability.
- Do not start new feature work until the above timing/runtime regressions are fixed on the user's latest dev baseline.

## 0.19.11
- Added exit sandbox preview endpoint for position/exit pretest.

Target next version: 0.19.8
Required fixes delivered:
- LINE status/report/recs now surface latest signal batch and portfolio state directly for Monday operator use.
- Remaining admin residual summaries are observational only and should not block Monday LINE validation.

# HANDOFF NOTES

## Project identity
- Project: Market Observer (MO)
- Lockdown baseline version inside this package: 0.19.6
- System role: Market Observer / Recommendation + Simulation + Review pipeline

## Verified deployed behavior before handoff
Latest validated remote behavior from user logs:
- `/admin/run?force=1` resolves `tradeDate=2026-03-13` correctly
- `REPORT_GATE` is active
- `PUSH_GATE` is active
- `RECOMMENDATION_GATE` is active
- `0.19.3` confirmed `reportStatus=VALID recStatus=READY actionable=Y pushed=true` on weekend force run
- issue found before 0.19.6: runtime endpoints could still show an older hard-coded version string even after local release version had advanced

## Current confirmed issues to carry forward
1. **Preview vs actual execution still needs live verification**
   - `simulation preview` can dry-run the latest pending batch
   - `execution audit` can now compare preview vs actual by symbol
   - next live market day still needs one real run to confirm no divergence

2. **Sandbox commit/reset not implemented yet**
   - current preview is non-destructive
   - if deeper weekend validation is required later, a dedicated commit/reset flow is still pending

## Current versioning policy (must follow)
- Use Semantic Versioning strictly
- This package is `0.19.6` development baseline
- A released version number is single-use: once any `0.19.6` release has been handed to the user, every further change must move forward to `0.19.7` or higher
- Patch versions should still be meaningful bug-fix increments, but they may never be reused for a different artifact
- If a release was delivered with the wrong contents, the correction must use the next patch version, not overwrite the same version label

## Release / baseline workflow
- Always develop from the uploaded `market-observer_dev_latest.zip`
- Never trust assistant-side temporary state over the uploaded baseline
- If baseline certainty is lost, ask the user to run `mo pack` and upload a fresh dev package
- Release artifact must be exactly `market-observer_release_latest.zip` unless the user explicitly asks for handoff

## Recommended next task
Target next version: 0.19.7

Required fixes:
- Verify 0.19.6 remote endpoints all show the correct version and latest signal batch state
- Use `/admin/simulation/commit` then `/admin/execution/audit` to compare preview vs actual by symbol in sandbox mode
- After sandbox verification, use `/admin/simulation/reset` so Monday starts from a clean state

## New-window continuation instruction
Upload this handoff zip in the new chat, then send:

`讀取檔案中的 MO_START.md 繼續專案；以這份 handoff/dev 包內的 0.19.6 baseline 為準，先做 0.19.7：cycleReady 聚合對齊與 sandbox/live execution state一致性，並遵守 docs/HANDOFF_NOTES.md 的版本規則與 baseline 規則。`
