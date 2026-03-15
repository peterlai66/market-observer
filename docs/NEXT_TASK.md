## v0.19.29 next
- Remote verify Monday flow with real pending batch: Friday signal should remain `pending` through weekend, and `/admin/status` must show `latestPendingExecDate` on the next trading day (for 2026-03-13 -> 2026-03-16).
- After Monday data lands, confirm pending -> executed, portfolio cash decreases, and positions become non-zero before continuing Position Monitor / Exit Engine work.
- If remote DB needs a clean validation run, allow clearing simulation tables and rerunning from 2026-03-16 as the fresh D0 baseline, but only after the operator confirms the deployed 0.19.29 runtime is active.

## v0.19.28 next
- Remote verify runtime version architecture: after update/deploy, `/admin/status` and `/admin/version` must both report `0.19.28`, and local repo must show `src/index.ts` importing `APP_VERSION` from `src/version.ts` instead of an inline constant.
- Keep `VERSION` as the single source of truth; future releases must not reintroduce hand-written runtime version strings in Worker source files.
- After version-architecture verification is confirmed, return to timing/push verification plus Position Monitor + Exit Engine + SELL quantity logic.

## v0.19.26 next
- Remote verify `/admin/review/status` and `/admin/status`: when current recommendation trade date is `2026-03-13`, `reviewExactSaved` must be `none` if only older rows like `2026-03-06` exist, and `reviewDisplayMode` should show `live_projection`.
- After remote verification is confirmed, decide whether stale old dev snapshots truly need cleanup tooling; until then, continue ignoring them at read time only.
- Then return to timing/push verification plus Position Monitor + Exit Engine + SELL quantity logic.

## v0.19.24 next
- Remote verify LINE `報告`: stale saved review such as `2026-03-06` must disappear entirely when the current recommendation trade date is `2026-03-13`; if no same-cycle snapshot exists, the UI should say `尚未建立 saved review`.
- If the remote DB still contains old dev snapshots, keep them ignored at read time first; only add cleanup/deletion tooling if stale rows still confuse later workflows.
- After stale snapshot filtering is confirmed, continue the planned review subsystem dedupe and then return to timing/push verification plus Position Monitor + Exit Engine + SELL quantity logic.

## v0.19.22 next
- Remote verify LINE `報告` 的 review 區塊新文案：應分開顯示「目前可觀察進度 / 最新 saved review / projected horizon」，不要再混成單句。
- Continue review subsystem cleanup: keep `_recommendation_review_lib.mjs` as the only calculation core, then gradually dedupe checkpoint constants / long diagnosis blocks without changing runtime meaning.
- After the review structure/doc alignment is stable, return to timing/push verification and then continue with Position Monitor + Exit Engine + SELL quantity logic + sandbox scenario tests.

## v0.19.21 next
- Remote verify LINE `報告`: when latest saved review batch is older than the current cycle/recommendation trade date, the review block should auto-project from live market dates instead of staying pinned to the old batch.
- Confirm projected review progress clearly says that per-symbol detail still needs a later `review-save` refresh.
- After review/date alignment is stable, return to timing/push verification and then continue with Position Monitor + Exit Engine + SELL quantity logic + sandbox scenario tests.

## v0.19.20 next
- Remote verify 0.19.20 in LINE: `狀態` / `報告` should both succeed and show timing guidance without runtime errors.
- Remote verify Friday delayed-summary path: if 16:00 first tick sees `summary_missing_or_misaligned`, later same-day tick must still be able to push once after summary becomes ready.
- Remote verify duplicate guard: repeated `/admin/run?push=1` on the same trade date must not send a second summary push.
- If timing guidance still feels off, refine learned windows again using source-ready / recommendation-ready timestamps or add explicit ready-time columns.
- After timing/push verification is stable, continue with Position Monitor + Exit Engine + SELL quantity logic + sandbox scenario tests.

## v0.19.12 next
- First priority: fix LINE runtime regression where `status` / `report` can fail with `buildMarketTimingHint is not defined`.
- First priority: block non-trading-day summary pushes; Saturday/Sunday must not emit `台股盤後總結` even if old source dates exist.
- Add explicit operator-facing timing state: tell the user whether MO is still within normal waiting window, has exceeded normal source arrival time, or is ready to produce analysis/recommendations.
- After the timing/push fixes are stable, continue with Position Monitor + Exit Engine + SELL quantity logic + sandbox scenario tests.

## v0.19.11
- Added /admin/exit/sandbox/preview for pretesting exit logic using live or sandbox positions.

## 0.19.8 next
- Monday live run: verify LINE「狀態 / 最新報告 / 建議」與實際 admin/run / D1 state一致。
- If web/admin residual summaries still diverge, keep fixing observer-only endpoints without touching live execution path.

## 0.19.7 next
- Deploy 0.19.6 and verify weekend sandbox flow end to end: preview -> commit -> audit -> reset.
- After commit, confirm `/admin/execution/audit` shows preview/actual MATCH and `/admin/status` shows sandbox snapshot active.
- After reset, confirm `latestExecuted` returns to `-`, positions return to baseline, and `latestSignal` falls back to pending-only state.
- If any mismatch remains, next step is to align cycle aggregation (`cycleReady`) with signal execution state.

## 0.19.6 next
- Deploy 0.19.5 and verify `/admin/version`, `/admin/status`, `/admin/simulation/preview`, `/admin/execution/audit` all return `version=0.19.5`.
- On the next live market day, run `/admin/run?force=1` once and compare `/admin/execution/audit` output against actual `EXECUTED / SKIPPED` results symbol by symbol.
- If execution audit shows mismatches, next step is a dedicated sandbox commit/reset flow so preview validation can be committed and cleared before formal live runs.
