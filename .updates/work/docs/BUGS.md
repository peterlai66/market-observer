## 2026-03-15 — resolved in 0.19.29
- Symptom: recommendation quantity felt opaque, making it hard to trust whether simulation sizing was genuinely calculated or just roughly fixed per ETF.
- Fix: extract a dedicated sizing engine and surface `deploy / target / weight / qty / notional` diagnostics in recommendation reasons and debug rows.

## 2026-03-15 — operator note
- Friday signal batches do not execute on Saturday/Sunday; `latestPendingExecDate` now exposes the next trading-day execution target explicitly to avoid false weekend alarms.

## 2026-03-15 — observability improved in 0.19.26
- Risk: even after exact-match filtering was fixed, remote verification still lacked a single endpoint to prove whether LINE `報告` was using same-cycle saved review or live projection.
- Fix: add `/admin/review/status` and extend `/admin/status` with review alignment lines (`reviewReferenceTradeDate`, `reviewExactSaved`, `reviewLatestAnySaved`, `reviewDisplayMode`, `reviewNeedsRefresh`).

## 2026-03-15 — resolved in 0.19.24
- Symptom: LINE `報告` could show an old saved review batch like `2026-03-06｜D1` even when the active recommendation trade date was already `2026-03-13`.
- Cause: Worker report lookup allowed `mo_recommendation_review_batches.trade_date <= referenceTradeDate`, so stale dev snapshots were treated as fallback context.
- Fix: report / AI payload / review item lookup now require exact `trade_date = current recommendation_trade_date`; otherwise the system shows `尚未建立 saved review` and uses projected horizon only.

## 0.19.22 fix note
- LINE `報告` 的 review 文案先前把可觀察進度、saved review 與 projected horizon 混在一起，雖然邏輯正確但閱讀成本高。0.19.22 起改為分層顯示，避免後續開發又把不同責任層寫混。
- review 子系統文件先前缺少單一權責整理文件，容易讓 Worker / CLI / scoreboard 各自長出重複定義。0.19.22 起新增 `docs/review_validation_architecture.md` 作為 canonical reference。

## 0.19.20 fix note
- `push-only` previously could mark `push_only_done=1` even when the result was only `SKIP summary_missing_or_misaligned`; this caused the same trade date to miss its later real push window. Fixed by marking done only after a successful LINE push.

## Resolved in 0.19.13
- LINE `status` / `report` previously could throw `buildMarketTimingHint is not defined` because the helper body was missing while the call sites remained active. A concrete timing helper is now restored.
- `push-only` previously could run on Saturday/Sunday and replay a misleading `台股盤後總結（YYYY-MM-DD）` push. It now skips non-trading days and requires the summary header/date to match the latest completed TW trading date.

## v0.19.12
- Critical: LINE `status` / `report` may fail at runtime with `buildMarketTimingHint is not defined`; `help` can still work because it does not hit that path.
- Critical: Saturday 16:00 push produced `台股盤後總結（2026-03-14）`; non-trading-day push guard is still incomplete.
- Operator note: LINE is now the primary validation surface for Monday live run; web/admin endpoints are secondary and may still show residual historical state.

## v0.19.11
- Exit sandbox preview currently uses deterministic thresholds (+4 trim / +8 full / -5 stop).

## 0.19.8
- web admin status / execution audit may still show historical residual batches; LINE views are now promoted as the primary operator surface for Monday verification.

## Resolved in 0.19.6
- Weekend sandbox execution previously could only preview fills; there was no controlled way to commit and then restore execution state before Monday's formal run. Added `/admin/simulation/commit` and `/admin/simulation/reset` to close that verification gap.


## Resolved in 0.19.5
- Runtime version constant in `src/index.ts` could remain on an older patch version even after `VERSION` / `package.json` had already advanced, causing remote endpoints to report the wrong deployed version.
- `/admin/status` previously relied too heavily on cycle flags alone; latest recommendation batch state was hard to read when signal date and calendar date diverged.

## Resolved in 0.19.4
- Remote runtime previously had no single endpoint to answer whether the latest cycle, push, pending orders, and tick dispatcher had actually run; operators had to infer status from multiple logs. `/admin/status` now consolidates that state.
- Weekend simulation validation previously risked mutating real D1 state if we used the live execution path for testing. `/admin/simulation/preview` now performs a non-destructive dry-run against the latest pending batch.

## 0.19.3
- pending remote verification: confirm deployed runtime exposes `/admin/version`, `/admin/run` returns `version=0.19.3`, and weekend/non-trading-day runs no longer classify the latest completed trading date as `SOURCE_DELAY`.
- pending remote verification: confirm operator report reads the newest open cycle and no longer shows stale `deadline / note` from an older active cycle.

## Resolved in 0.19.3
- Report validator previously still depended on timezone-sensitive `Date` conversion, so weekend `/admin/run` could misread the latest completed trading date and keep returning `SOURCE_DELAY`. It now resolves completed trading dates from explicit Asia/Taipei date parts.
- Operator report header previously could be lifted by an open cycle calendar date (for example `2026-03-14`) instead of the newest market trade date (`2026-03-13`), causing the top line to disagree with the actual data coverage.
- Operator/status views previously preferred the oldest open cycle, so `本輪觀察截止` / `系統備註` could stay pinned to an older cycle even after newer market data and recommendations already existed.

## Open after 0.19.1
- Need remote validation for `/admin/run?force=1` and LINE `最新報告` across weekday-before-close / weekday-after-close / weekend scenarios, to confirm the 0.19.1 validator and header fixes match deployed behavior.
- Live-projected review horizon now updates operator narration, but item-level review rows still require a fresh `recommendation-review-save` run to fully refresh symbol details.

## Resolved in 0.19.1
- Report validator no longer misclassifies a fully available latest completed trading date as `SOURCE_DELAY`; it now accepts the latest completed trading day as `VALID` when summary / snapshot / index sources are aligned.
- LINE report / operator header now uses a clearer `資料截至 YYYY-MM-DD` header when the latest valid trade date differs from the current calendar date.
- Review horizon no longer stays pinned to an older saved review batch inside the LINE operator report; it now auto-projects from the latest available market dates.

## Resolved in 0.18.0
- FinMind backstop 先前使用 `TaiwanStockPrice` 全市場查詢，免費/註冊等級會直接回 400，導致遠端 log 被大量 probe failed 汙染，且無法參與 tradeDate 驗證。0.18.0 起改用 `TaiwanStockTradingDate`。
- legacy probe 先前可能漏掉最重要的 `anchor+1`（例如 3/10），反而把 today（例如 3/11）塞進 probes，讓單一 legacy 來源把 tradeDate 拉到 +2 天並觸發 ABORT。0.18.0 起改為 anchor-based forward probe，並忽略超過 +1 天的候選值。

## Resolved in 0.17.8
- TWSE legacy MI_INDEX probe previously started from current day, which could return a date two days ahead of the primary OpenAPI consensus and force the pipeline into NOT READY. It now probes around the primary consensus date and only accepts a +1 day backstop.

## Resolved in 0.17.7
- TWSE `FMTQIK` previously could resolve to the first row date (for example 2026-03-02) even when the payload already contained newer dates through 2026-03-09. It now takes the latest distinct date and logs the observed span.
- Artifact pack scripts previously relied on per-script hard-coded file lists, so newly added root files could be omitted from dev/release/patch zip outputs unless every pack script was updated manually. Pack scripts now auto-include root repo files.

## Resolved in 0.17.6
- AI 預設 model 先前可能落到 `gpt-5-mini`，與 MO 成本/延遲策略不一致。0.17.6 起改為預設 `gpt-4o-mini`，並由 wrangler vars 鎖定。
- AI 呼叫先前只能看到 `call start`，不易確認是否真的成功取得回應。0.17.6 起新增 `mo_ai_audit` 與成功/失敗 log。

## Resolved in 0.17.3
- LINE `AI 報告 / AI 狀態 / AI 建議` 先前可能因 OpenAI 慢回導致 webhook 被 cancel，表面上看起來像完全沒回覆。0.17.3 起改成短 timeout + OpenAI abort + 內建摘要 fallback。
- LINE `report` 先前雖已切到最新 operator report，但內容仍過度偏工程欄位；0.17.3 起改成對人可讀的 operator narration。

## Resolved in 0.17.0
- LINE `report` previously showed stale weekly/older summary because it only read `twse_daily_summary`. It now returns the newest cycle/review operator report and appends the latest available summary as a secondary block.

## 0.16.1
- recommendation-review-save now respects review-side fill fallback when SIM_FILL_POLICY=RANGE_OR_CLOSE, promoting eligible D0 range misses into executed review samples for scoreboard accumulation.

## 0.16.0
- 0.15.1 前可能長期卡在 `execution:buy-range-not-hit` 而沒有 executed samples；0.16.0 起新增 `SIM_FILL_POLICY`，預設 `RANGE_OR_CLOSE`。

# BUG STATUS 0.15.1

- 已修正 review_note 無法細分 execution gate 原因的診斷缺口。

## 0.14.9 known limits
- D5 / D10 / D20 remain naturally locked until enough future TW trade dates exist in `prices_daily`.
- This is no longer treated as the same class of failure as `missing-close` once D0 is already valid.

## Open after 0.14.8
- TW price coverage remains incomplete in `prices_daily` for `00757.TW` / `00919.TW`, and `00878.TW` still needs newer dates.
- Historical bare-symbol review rows from pre-0.14.8 runs may remain until the repaired save path is executed successfully on remote D1.

## Open after 0.14.6
- `prices_daily` still lacks full TW close history for `00757.TW` / `00919.TW`, and `00878.TW` currently stops at 2026-03-02 in remote D1.
- Historical bare-symbol review rows may still exist in remote D1 until a dedicated cleanup/migration pass is executed.

## 0.14.4
- Resolved: MO previously stalled at "no report -> no recommendation", which blocked the initial 20-trading-day simulation loop.
- Fix: introduce cycle state tracking and decouple recommendation/simulation bootstrap from report push timing.

## 0.11.3
- No new known bugs at release time.

## Open Bugs

### BUG-20260307-09
Title: Trade sizing must account for minimum quantity and transaction costs to avoid fee-inefficient orders
Status: Fixed in 0.10.0

## Open Bugs

### BUG-20260307-08
Title: Universe candidates rejected by missing_close / invalid_close in final recommendation gate
Status: Fixed in 0.9.1

# BUG TRACKER

## Open Bugs

### BUG-20260307-04
- Title: Universe candidates are generated, but final recommendation selection returns zero recommendations.
- Status: Fixed in 0.9.0
- Evidence: `mo_recommendation_log` showed `candidate_count > 0` with `rec_count = 0`; LINE 顯示「明日建議：不動（無明顯機會）」。
- Resolution: strengthen universe snapshot backfill (`close / chg / value`) and add conservative `starter_fallback` selection when normal ranking produces 0 recommendations under `TRY/AGGRESSIVE`.
- Verification: deploy 後以 LINE `狀態 / 建議 / debug` 驗證，預期可看到至少一筆 observation-style recommendation，或在 debug 中看到更完整的 rejected/selected 記錄。

## Fixed Bugs

### BUG-20260307-05
- Title: Release artifact delivered with a versioned filename instead of `market-observer_release_latest.zip`, causing `mo update` to fail.
- Status: Fixed in 0.8.5
- Resolution: 新增 `scripts/validate-artifacts.mjs`、`mo validate-artifacts`，並讓 smoke 在 release 後強制驗證 artifact 命名與 outbox 結構。
- Verification: `npm run mo -- release` 後執行 `npm run mo -- validate-artifacts`；若出現非 `market-observer_release_latest.zip` 的 release 檔或 deprecated outbox 子目錄，流程會失敗。

### BUG-20260307-03
- Title: `etf_universe` exists in D1, but strategy engine only filtered `topByValue`, causing `done 0/0` and no new recommendations.
- Status: Fixed in 0.8.3
- Resolution: universe 來源改為優先讀 D1 `etf_universe(enabled=1)`，並從 `stocksAll` 全量快照建立 universe 候選，不再只在 `topByValue` 內找。
- Verification: deploy 後可用 LINE `universe` / `狀態` / `建議` 與 D1 `mo_orders`、`mo_recommendation_log` 驗證。

### BUG-20260307-02
- Title: `mo_recommendation_log` runtime schema drift with existing migration / legacy logs.
- Status: Fixed in 0.8.3
- Resolution: `ensureMultiAssetTables` 會補齊 recommendation log 缺欄位；`狀態` 查詢可兼容 legacy schema 與 `recommendation_log`。
- Verification: `狀態` 不再因 log schema 差異失敗；新 tick 後可查到最新 recommendation log。

### BUG-20260307-01
- Title: Deprecated outbox subdirectories not fully removed from local repo
- Status: Fixed in 0.8.1
- Resolution: `apply-update` / `apply-patch` / `sync-structure` 現在會清理 `.updates/outbox/dev`、`.updates/outbox/release`、`.updates/outbox/handoff`、`.updates/outbox/patch`，並以單一 `.updates/outbox/` 結構為準。
- Verification: 使用者在 0.8.1 實測 `mo update` 後，本機 repo 已顯示 cleanup removed 並成功 `mo smoke` / `mo deploy`。

## Regression Guards
- All newly discovered bugs must be recorded here.
- Bug fixes must update status and mention the bug ID in CHANGELOG / RELEASE_NOTES when relevant.
- Release validation is based on the real package after `mo update`, not on chat claims.

- [fixed 0.10.1] 重跑 `/admin/run` 會為同 `signal_date + symbol + side` 重複建立 `PENDING` 單，現已改為 idempotent insert；舊重複單需一次性 SQL 清理。


## 0.10.2 guardrail response
- Problem: AI 在 release 交付時多次未遵守 `market-observer_release_latest.zip`、未完全依 dev 包開發、對話中過度說明而未直接產出正確 artifact。
- Mitigation: 新增 `scripts/guard.mjs`、`scripts/sanity.mjs`、`mo guard`、`mo sanity`，並將 `pack:release` 改為自動先跑 guardrail 流程。
- Verification: `npm run mo -- guard`、`npm run mo -- sanity`、`npm run mo -- release` 均需成功；若 release 名稱、文件、版本不同步，流程應直接失敗。


## 0.10.3 guardrail follow-up
- Problem: release 前需要人工記住 doctor / smoke / guard / sanity 的順序，容易在多輪驗證中漏跑。
- Mitigation: 新增 `mo autopilot` / `mo autopilot-worker`，將例行巡檢固定為單一指令。
- Verification: `npm run mo -- autopilot` 與 `npm run mo -- autopilot-worker` 需成功，且輸出應包含各步驟成功紀錄。


## 0.10.4 guardrail consolidation
- Problem: `guard`、`sanity`、`validate-artifacts` 與 `doctor/smoke` 需要人工記住多組順序，`autopilot` 與 release 流程也可能逐漸分叉。
- Mitigation: 新增 `mo validate`、`mo preflight`、`mo preflight-worker`，並讓 `autopilot` 轉呼叫 preflight，收斂單一巡檢定義。
- Verification: `npm run mo -- validate`、`npm run mo -- preflight`、`npm run mo -- preflight-worker`、`npm run mo -- autopilot`、`npm run mo -- release` 均需成功。


## 0.10.8 runtime-invariants parser hotfix
- Problem: `scripts/runtime-invariants.mjs` 直接對 `wrangler.jsonc` 使用 `JSON.parse`，遇到註解 / trailing comma 時會在 `loadDbName()` 崩潰，導致 `runtime-invariants`、`preflight-worker`、`autopilot-worker` 全部失敗。
- Mitigation: 改為使用可容忍 JSONC 的解析流程（去 comment + 去 trailing comma 後再 parse）。
- Verification: `npm run mo -- runtime-invariants`、`npm run mo -- preflight-worker`、`npm run mo -- autopilot-worker` 均需成功，且不得再出現 `Expected double-quoted property name in JSON`。

## 0.10.5 runtime consistency guard
- Problem: preflight 先前只驗 toolchain / artifact，無法在 deploy 前攔下 remote D1 的負現金、NaN/非正持倉、缺 snapshot / stale snapshot、`EXECUTED` 缺 `exec_date`。
- Mitigation: 新增 `scripts/runtime-invariants.mjs` 與 `mo runtime-invariants`，並將其納入 `preflight-worker` / `autopilot-worker`。
- Verification: `npm run mo -- runtime-invariants`、`npm run mo -- preflight-worker`、`npm run mo -- autopilot-worker` 均需成功；若故意製造負現金或缺 snapshot，流程應直接失敗。


## 0.10.9 closed-loop audit gap
- Problem: `runtime-invariants` 只驗 cash / positions / snapshot freshness，對 `EXECUTED` 與 filled execution marks 的閉環對齊仍缺一個單獨驗證腳本。
- Mitigation: 新增 `mo portfolio-verify`，將 closed-loop 驗收獨立出來。
- Verification: `npm run mo -- portfolio-verify` 在空投組時成功 skip；未來有 executed orders 時需成功驗證 executed orders 與 filled marks 對齊。


## 0.11.0 scope note
- 本版沒有新增 bug fix；重點是把 MO 的主線校正回推薦驗證，並提供 `mo recommendation-review` 作為 D0 / D5 / D10 / D20 檢視工具。

- 0.11.0: `recommendation-review` 曾錯誤假設 `mo_orders.score` 存在，造成 remote D1 `no such column: score`；0.11.1 改為 schema-aware 查詢。


- 0.11.2：未新增新 bug；本版重點是把 `recommendation-review` 的資料不足 / 尚未到觀察日 / 未成交訊號區分清楚，避免驗證誤讀。

## 0.11.6
- No new known bugs at release time.


## 0.14.8 focus
- 仍需驗證 TWSE monthly close 回填是否覆蓋 ETF（特別是 00757.TW / 00919.TW）。
- 若官方月資料端點對 ETF 返回空資料，需要補次級資料來源。


- 0.15.1 hotfix: fixed `scripts/recommendation-scoreboard.mjs` crash (`executionBreakdown is not defined`).

- [fixed] 3/11 凌晨 tradeDate 仍停在 3/9：已改為 legacy probe 含 today/today-1，並加入 FinMind backstop。
- [fixed] 最新報告被舊 review batch 綁成 3/6：已改為取最新 cycle / recommendation / summary 日期。

- [fixed] 3/15 review 區塊跟不上 3/13 主判讀：Worker `報告` 已改為優先看當前 reference trade date，若 saved review batch 較舊則自動用 live market dates 投影 horizon。

## Closed in 0.19.28
- Runtime version drift bug: `VERSION` / `package.json` could be updated while `src/index.ts` still kept an older inline `APP_VERSION`, causing remote status/version endpoints to lag behind the delivered release.
