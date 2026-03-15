- Review 子系統的單一責任與資料契約，現以 `docs/review_validation_architecture.md` 為準。
## 0.17.3 update
- LINE `report` 現在以 operator narration 為主，不再把 `summary / rec / sim / actionable` 這些工程欄位直接丟到主畫面。
- AI explain layer 改成 webhook-safe：2.5 秒內若 GPT 未完成，就直接回內建摘要，確保 LINE 一定有回覆。

## 0.17.0 update
- LINE report delivery no longer depends on `twse_daily_summary` being最新；`report` 會優先回傳最新 cycle/review/operator 狀態，避免使用者只看到上週報告。
- AI report payload now carries cycle + review batch + review items + recommendation context, preparing GPT narration for operator-facing delivery.

## 0.16.1
- recommendation-review-save now respects review-side fill fallback when SIM_FILL_POLICY=RANGE_OR_CLOSE, promoting eligible D0 range misses into executed review samples for scoreboard accumulation.

# PROJECT UPDATE 0.15.1

- 已新增 execution gate breakdown，讓 recommendation scoreboard 能區分資料累積與成交阻塞。

## 0.14.9 scoreboard coverage accumulation
- `mo recommendation-scoreboard` now separates real data repair from normal future-day waiting.
- When `missing-close=0` and the dominant issue is only `not-enough-trade-days`, MO reports `coverage_wait` / `COVERAGE_ACCUMULATION` and surfaces the next horizon unlock target instead of overstating a repair failure.

## 0.14.8
- 0.14.8 is a stability hotfix for the review pipeline, not a new feature layer. It restores the helper functions needed for canonical TW review saves and same-date bare-symbol cleanup.

## 0.14.6
- MO now persists TW daily close snapshots into `prices_daily` during the daily pipeline and review-save prefers this table for return evaluation.
- TW recommendation/review persistence is canonicalized to `.TW`, reducing join mismatch between `etf_universe`, `mo_orders`, `mo_recommendation_review_items`, and `prices_daily`.

## 0.14.4
- MO 正式把 report 視為 daily cycle 的可見產物之一，而不是整個主流程的唯一啟動條件。
- 新增 `mo_cycle_state`，讓系統可從盤後一路重試到隔日開盤前，並把 `data / summary / recommendation / simulation / actionable` 狀態分開管理。
- 初期 20 交易日模擬驗證現在以 recommendation/simulation bootstrap 為主，不再被 report push 成敗完全卡死。
- GPT explanation layer 現在可透過 LINE `ai 狀態` / `ai 報告` / `ai 建議` 讀取 cycle-aware payload。

## 0.14.2
- Added weekly operator message layer for report payload shaping and publish-ready messaging.

- 0.13.7: full pipeline readiness summary added to recommendation-scoreboard.
Current stable release: 0.13.2
Latest addition: symbol repair status transitions for per-symbol blocker progression.

0.13.0

0.12.9


## 0.12.7
- 系統現在可在 scoreboard 末段直接輸出 data quality 診斷與修復優先順序。
- 若 skip 原因以 `data_gap` / `data_coverage` 為主，MO 會明確把問題定義為資料阻塞，而非策略 edge 問題。
## Current Version
- 0.12.6
- Recommendation Validation Engine / Performance + Diagnosis + Skip Reason Normalization


> 0.12.5: recommendation-scoreboard 新增 actionable_recommendations，可將 diagnosis / top findings 轉成下一步行動建議。

## Current focus
- Execution fill policy now defaults to `RANGE_OR_CLOSE`; use `SIM_FILL_POLICY=STRICT_RANGE|RANGE_OR_CLOSE|NEXT_OPEN` to override worker behaviour.
- 系統版本進入 `0.12.1`，Recommendation Performance Engine 現在已具備 execution-aware performance summary，可用來分辨 recommendation edge 與 execution gate 的效果。


## 0.12.0 Recommendation Performance Engine
- 系統仍是 Recommendation Validation Engine，但 `recommendation-scoreboard` 現在已具備 performance layer。
- 新增 checkpoint performance 指標：`expectancy`、`avg_win_return`、`avg_loss_return`、`edge_ratio`、`nonflat_evaluable`、`decisive_rate`。
- 新增 rolling 視角：`last_1_batch` / `last_3_batch` / `last_5_batch`。
- release 現在內含 `BASELINE.json`，作為 locked baseline manifest。

## 0.11.9 Recommendation Outcome Classification
- 系統仍是 Recommendation Validation Engine。
- `recommendation-scoreboard` 現在除了 outcome metrics / classification / performance，也會提供 diagnosis 區塊，協助判讀推薦 edge 與 execution gate。
## 0.11.3 recommendation review snapshot
- 新增 `mo recommendation-review-save`，會把最新推薦批次的 review 結果正式落表到 D1。
- 新增 review snapshot tables：`mo_recommendation_review_batches`、`mo_recommendation_review_items`（由腳本自動建立）。
- 後續可基於這兩張表擴充 scoreboard、命中率與平均報酬統計。

## 0.11.0 update
- MO 的定位明確校正為「20 個交易日內驗證推薦有效性」的模擬驗證系統，而非實盤交易系統。
- 新增 `mo recommendation-review`，可直接回看最新推薦批次在 D0 / D5 / D10 / D20 的模擬表現。
- 目前推薦驗證主線為：`mo runtime-invariants` → `mo portfolio-verify` → `mo recommendation-review`。

## 0.10.0 update
- MO 已進入成交閉環第一階段：strategy output 不只會產生 `mo_orders`，也會在 recommendation 與 execution 兩端做成本感知過濾。
- 新增交易守門概念：`minQty`、`minNotionalTwd`、`roundTripCost`、`edge_lt_cost`。
- 目前 TW ETF 採保守規則：先過成本與最小量門檻，再進入 PENDING / EXECUTED / SKIPPED 流程。

# PROJECT

## Current state
- CLI / update / smoke / deploy pipeline stable
- ETF universe comes from env -> D1 -> default fallback
- Multi-asset engine now generates candidates from universe snapshots
- 0.9.0 adds conservative starter fallback so the system can move from pure observation to actionable recommendations
- LINE commands for operational verification: 狀態 / 建議 / debug / universe

- 0.9.1: final recommendation close-price mapping now resolves TW ETF prices from raw close, OHLC fallback, and candidate fallback before rejecting for invalid close.

- 0.10.1 已修正同交易日重複建單問題；`mo_orders` 改為 idempotent insert，重跑 `/admin/run` 只會記錄 dedupe，不再污染訂單表。
- `mo_execution_mark` 現在會記錄 `SKIPPED / EXECUTED` 結果，方便驗證 pending 單後續是否真的被處理。


## 0.10.2 toolchain guardrail
- 新增 `mo guard` / `mo sanity`，用來在 release 前先攔下 AI 偏離流程、錯誤檔名、文件未同步、版本不同步等問題。
- `pack:release` 會自動串起 `sync-structure` → `doctor` → `guard` → `sanity` → `validate-artifacts`。
- 正式開發循環固定為：release 驗證 / 討論 → 使用者提供 `market-observer_dev_latest.zip` → AI 開發 → release。


## 0.10.3 autopilot preflight
- 新增 `mo autopilot` / `mo autopilot-worker`，把 release 前與 deploy 前的例行巡檢收斂成單一指令。
- 目標是讓 AI 與使用者在每輪驗證時不再漏跑 doctor / smoke / guard / sanity。


## 0.10.4 validate/preflight
- 新增 `mo validate`，把 `guard / sanity / validate-artifacts` 收斂成單一 release 契約檢查。
- 新增 `mo preflight` / `mo preflight-worker`，把 release 前與 deploy 前的固定巡檢進一步明文化。
- `mo autopilot` 現在作為相容入口，統一轉呼叫 preflight。


## 0.10.8 runtime-invariants hotfix
- 修正 `runtime-invariants` 讀取 `wrangler.jsonc` 時無法處理 JSONC 註解 / trailing comma 的問題。
- `preflight-worker` / `autopilot-worker` 現在可真正把 runtime invariants 跑完，而不是在設定解析階段就失敗。

## 0.10.5 runtime consistency
- 新增 `mo runtime-invariants`，deploy 前可直接查 remote D1 的 `mo_portfolio_state`、`mo_positions`、`mo_execution_mark`、`mo_orders` 是否一致。
- `mo preflight-worker` / `mo autopilot-worker` 現在不只驗工具鏈，還會驗資料層：負現金、非有限持倉、缺 snapshot / stale snapshot、`EXECUTED` 缺 `exec_date`。


## 0.10.9 portfolio verify
- 新增 `mo portfolio-verify`，作為 FS-01 Portfolio Closed Loop v2 的資料層驗收腳本。
- 目前在尚無 executed orders 的空投組狀態下，腳本會成功輸出 skip；未來有成交後，將檢查 executed orders 與 filled execution marks 的對齊。

- 0.11.1: `recommendation-review` 改為 schema-aware，不再假設 `mo_orders.score` 存在；release 驗證流程改為先 `doctor` 確認版本，再驗目標腳本。


## 0.11.2 recommendation review clarity
- `mo recommendation-review` 現在會明確顯示目前可回看到的最大交易日 (`max_review_horizon`)，以及哪些 checkpoint 尚未到達。
- Review 輸出會區分 `not-enough-trade-days`、`missing-close`、`signal-generated-but-not-filled`，避免把資料不足與推薦失敗混在一起。

## 0.11.6 recommendation scoreboard
- 新增 `mo recommendation-scoreboard`，可彙總已落表的 recommendation review batch / item 統計。
- 目前先提供批次數、symbol 數、filled/skipped/pending 比例與最新 batch 摘要，作為後續 FS-02 Recommendation Scoreboard 的基線。


## 0.11.8 Recommendation Outcome Metrics
- `mo recommendation-scoreboard` 現在會在既有 summary 後追加 D0 / D5 / D10 / D20 outcome metrics。
- 指標包含 evaluable、coverage、positive、positive_rate、average_return。
- 這些統計用於推薦驗證，不代表真實交易績效結算。


0.12.3: batch-level summary + top findings added to recommendation-scoreboard.

- 0.12.9：新增 data coverage map / repair targets，讓 recommendation scoreboard 可直接列出需優先修補資料的 symbol。


0.13.4: blocked repair completion criteria added.

- 0.13.6: strategy evaluation unlock layer added to recommendation-scoreboard.


## 0.13.9
- Add operator final decision summary layer to recommendation-scoreboard.


- 0.14.2: added weekly_delivery_formatting_summary / weekly_delivery_formatting_blocks / weekly_delivery_formatting_actions for LINE/email/log payload shaping.


## 0.14.8
- Review path now attempts TW monthly close backfill into `prices_daily` before scoring checkpoints.
