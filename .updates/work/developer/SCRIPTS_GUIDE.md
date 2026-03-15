## 0.17.7 pack + TWSE date guard
- `pack` / `pack:release` / `pack:patch` now auto-include root repo files (excluding zip/log/temp folders) so new baseline/docs/config files are less likely to be dropped from artifacts.
- TWSE trade-date debug now logs date span for FMTQIK / STOCK_DAY_ALL and may emit legacy MI_INDEX probe results when OpenAPI freshness lags.

## 0.17.0 operator report delivery
- Verify with `npm run mo -- recommendation-review-save`, then LINE `report / 最新報告`.
- Expect latest cycle/review state even when `twse_daily_summary` is older than the active trade date.

## 0.16.1
- recommendation-review-save now respects review-side fill fallback when SIM_FILL_POLICY=RANGE_OR_CLOSE, promoting eligible D0 range misses into executed review samples for scoreboard accumulation.

# Script Guide 0.15.1

- recommendation-scoreboard 會額外輸出 execution_gate_breakdown 與 execution_gate_top_reasons。

## 0.14.9 scoreboard operator guidance
- Read `coverage_accumulation_summary` before treating `not-enough-trade-days` as a repair bug.
- If `coverage_mode=ACCUMULATING`, the next action is to wait for more future trade dates rather than patching symbol/price joins again.

## 0.14.8 notes
- This is a release hotfix for `_recommendation_review_lib.mjs`: missing helper definitions caused `recommendation-review-save` to crash in 0.14.6.
- Use 0.14.8 as the new locked baseline; do not resume development from 0.14.6 unless this hotfix has been applied.

## 0.14.6 notes
- `recommendation-review-save` now uses unique trade dates and `prices_daily` fallback, so duplicated `twse_daily_raw` rows no longer inflate `available_trade_dates`.
- Daily pipeline writes active-universe TW closes into `prices_daily`; use this as the primary diagnostic source for `missing-close` blockers.

## 0.14.4
- Worker runtime now maintains `mo_cycle_state` for daily cycle retries and exposes GPT explanation commands through LINE.

## 0.14.2
- Added weekly operator message layer for report payload shaping and publish-ready messaging.

- 0.13.7: recommendation-scoreboard adds pipeline readiness summary sections.
0.13.2 scoreboard extension: symbol repair transition layers based on coverageMap severity.

0.13.0

0.12.8


## recommendation-scoreboard 0.12.7
- 新增 data quality action layer。
- 目的：把 `skip_reason_breakdown` 的結果進一步整理成資料阻塞嚴重度、資料問題重點與修復行動。
## recommendation-scoreboard
- 0.12.6 起：skip reason breakdown 依賴 `review_note`，查詢欄位不可移除。
- 需保留 structured normalization，將 checkpoint-prefixed marks 映射到穩定 reason / family。


> 0.12.5: recommendation-scoreboard 新增 actionable_recommendations，可將 diagnosis / top findings 轉成下一步行動建議。

## recommendation-scoreboard (0.12.1)
- 在既有 scoreboard output 上新增 `*_execution_summary` 區塊。
- 每個 checkpoint 需輸出 overall / executed / skipped / pending 的 evaluable share、average return、positive / win / loss / flat rate、expectancy、decisive rate。
- 目的：快速判斷 edge 是來自 recommendation 還是 execution gate。


## 0.12.0 Recommendation Performance Engine
- 目標腳本：`scripts/recommendation-scoreboard.mjs`、`scripts/baseline.mjs`、`scripts/write-baseline.mjs`
- 本版在保留既有 summary / outcome metrics / classification 的前提下，新增 checkpoint performance、rolling summary 與 locked baseline manifest。
- 驗證優先順序：先 `doctor`，再 `recommendation-scoreboard`，最後 `baseline`。

## 0.11.9 Recommendation Outcome Classification
- 目標腳本：`scripts/recommendation-scoreboard.mjs`
- 本版在不破壞既有 summary 與 0.11.8 outcome metrics 的前提下，新增 checkpoint classification 與 execution status 切片。
- 驗證優先順序：先 `doctor`，再 `recommendation-scoreboard`。
# SCRIPTS GUIDE

## Core commands
- `npm run mo -- doctor`
- `npm run mo -- smoke`
- `npm run mo -- smoke-worker`
- `npm run mo -- pack`
- `npm run mo -- guard`
- `npm run mo -- sanity`
- `npm run mo -- validate`
- `npm run mo -- preflight`
- `npm run mo -- preflight-worker`
- `npm run mo -- runtime-invariants`
- `npm run mo -- portfolio-verify`
- `npm run mo -- recommendation-review`
- `npm run mo -- recommendation-review-save`
- `npm run mo -- autopilot`
- `npm run mo -- autopilot-worker`
- `npm run mo -- patch`
- `npm run mo -- release`
- `npm run mo -- update`
- `npm run mo -- deploy`
- `npm run mo -- logs`

## When to run what
### 工具鏈 / 文件變更
1. `npm run mo -- smoke`
2. `npm run mo -- guard`
3. `npm run mo -- sanity`
4. `npm run mo -- update`
5. `npm run mo -- validate`
6. `npm run mo -- preflight`

### Worker / src / wrangler / migrations 變更
1. `npm run mo -- smoke`
2. `npm run mo -- smoke-worker`
3. `npm run mo -- guard`
4. `npm run mo -- sanity`
5. `npm run mo -- update`
6. `npm run mo -- validate`
7. `npm run mo -- preflight-worker`
8. `npm run mo -- runtime-invariants`
9. `npm run mo -- deploy`

## Important rule
- `update` 只更新 local repo。
- `deploy` 才會把 Worker 發佈到 Cloudflare。
- 若 release 包內含 `src/`、`wrangler.jsonc`、`migrations/`、`worker-configuration.d.ts`，update 後必須 deploy。
- 所有 release 必須同步更新 `VERSION`、`CHANGELOG.md`、`RELEASE_NOTES.md`，以及受影響文件。

## pack family
- `pack` → `.updates/outbox/market-observer_dev_latest.zip`
- `pack:patch` → `.updates/outbox/market-observer_patch_latest.zip`
- `pack:release` → `.updates/outbox/market-observer_release_latest.zip`
- `outbox/bak/` → previous `_latest.zip` 歸檔

## outbox contract
- 單一根目錄：`.updates/outbox/`
- 廢棄子目錄：`outbox/dev`、`outbox/patch`、`outbox/release`、`outbox/handoff`
- `sync-structure`、`patch`、`update` 都必須自動清理廢棄子目錄

## handoff rule
- `mo pack` 只產生 local 最新快照，不是 handoff 包。
- 聊天中輸入 `handoff` 時，AI 必須先比對 repo / 文件 / 規則 / 未修 bug，再產生新的 `mo_handoff_YYYYMMDD_HHMM.zip`。
- AI 不可把使用者上傳的 dev pack 直接改名交付。


## validate-artifacts
- `node scripts/validate-artifacts.mjs`
- 專責檢查 `.updates/outbox/` 結構與 artifact 命名契約。
- 若發現 `.updates/outbox/dev|patch|release|handoff` 或任何 `market-observer_release_<version>.zip`，必須直接失敗。

## guard / sanity
- `guard`：專門抓 CLI 契約、關鍵文件、release 檔名規則、MO_START / docs 是否同步。
- `sanity`：檢查版本同步、release notes / changelog 是否齊、必要文件是否存在。
- `pack:release` 現在會自動先跑 `sync-structure` → `doctor` → `guard` → `sanity`，再打包並執行 `validate-artifacts`。

## validate / preflight / autopilot
- `validate`：一鍵跑 `guard -> sanity -> validate-artifacts`；若 outbox 尚未有 release，會先以 skip 模式完成前置巡檢。
- `preflight`：一鍵跑 `doctor -> smoke -> validate`，適合 release 前工具鏈巡檢。
- `preflight-worker`：一鍵跑 `doctor -> smoke -> smoke-worker -> validate -> runtime-invariants`，適合 deploy 前總巡檢。
- `runtime-invariants`：直接查 remote D1，攔下負現金、NaN/非正持倉、缺 snapshot、`EXECUTED` 缺 `exec_date`。
- `autopilot` / `autopilot-worker`：相容別名，內部轉呼叫 preflight，不再各自維護另一套流程。


## mo portfolio-verify
- 驗證 Portfolio Closed Loop v2 的資料層一致性。
- 檢查 `mo_portfolio_state`、`mo_positions`、`mo_orders(status=EXECUTED)`、`mo_execution_mark(filled=1)`。
- 若尚無 executed orders，會顯示 skip 並成功結束。


## 0.11.0
- 新增 `mo recommendation-review`。
- 用途：回看最新推薦批次在 D0 / D5 / D10 / D20 的模擬表現，驗證 MO 的推薦是否有效。
- 這是推薦驗證腳本，不是實盤交易或下單腳本。

- Release 交付規則：每輪必須列出實際改動檔案，先驗 `doctor` 版本，再驗目標腳本；不可未證明就宣稱修正完成。


- `scripts/recommendation-review.mjs`：0.11.2 起會先顯示目前可回看交易日範圍，再針對每個 checkpoint 標示 `not-enough-trade-days` / `missing-close` / `signal-generated-but-not-filled`。

## 0.11.3
- 新增 `mo recommendation-review-save`。
- 用途：把最新推薦批次的 review 結果正式落表到 D1，作為 scoreboard / 統計的上游資料。

## 0.11.6
- 新增 `mo recommendation-scoreboard`。
- 用途：從 `mo_recommendation_review_batches` / `mo_recommendation_review_items` 匯總批次統計，作為後續勝率/報酬 scoreboard 的第一版。


0.12.3: batch-level summary + top findings added to recommendation-scoreboard.

## 0.12.9
- `recommendation-scoreboard.mjs` 新增 `data_coverage_map` 與 `repair_targets`，用於 symbol 層級資料修復優先排序。


0.13.4: blocked repair completion criteria added.

- 0.13.6: recommendation-scoreboard adds strategy evaluation unlock sections.


## 0.13.9
- Add operator final decision summary layer to recommendation-scoreboard.


- 0.14.2: added weekly_delivery_formatting_summary / weekly_delivery_formatting_blocks / weekly_delivery_formatting_actions for LINE/email/log payload shaping.


## 0.14.8 review repair
- `recommendation-review` / `recommendation-review-save` 內建 TW monthly close backfill，優先修復 `.TW` close 缺口。
- 若 review 仍只剩 `not-enough-trade-days`，代表程式已進入純資料等待階段。


## SIM_FILL_POLICY
- Worker execution default: `RANGE_OR_CLOSE`
- 可覆寫為 `STRICT_RANGE` 或 `NEXT_OPEN` 以測試不同 fill policy。

- 打包 script 需持續帶入新 root 檔案；若新增 trade-date/backstop 文件，pack/release 需一併納入。
