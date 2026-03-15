## 0.17.6 AI verification
- `ai 狀態` / `ai 報告` / `ai 建議`：現在會固定使用 `gpt-4o-mini`，並可從 Cloudflare Logs 確認 `[AI] call start / ok / fail`。
- 若 `AI_ENABLED=0`，LINE 會自動回退到內建摘要，不會真的呼叫 OpenAI。

## LINE latest report
- `report` / `最新報告` / `本週報告`：回傳最新 cycle + review operator report；若 `twse_daily_summary` 落後，會明確說明摘要資料日與目前 trade date 的差異。

## 0.16.1
- recommendation-review-save now respects review-side fill fallback when SIM_FILL_POLICY=RANGE_OR_CLOSE, promoting eligible D0 range misses into executed review samples for scoreboard accumulation.

## 0.14.9 command note
- `npm run mo -- recommendation-scoreboard` now prints `coverage_accumulation_summary` after `evaluation_readiness`.
- Use it to see `latest_actionable_checkpoint`, `next_unlock_checkpoint`, and `future_trade_days_needed`.

## 0.14.8 validation
- Mandatory after update: rerun `npm run mo -- recommendation-review-save`; 0.14.8 specifically fixes the helper crash from 0.14.6.
- Then rerun `npm run mo -- recommendation-scoreboard` and confirm the duplicated bare-symbol rows stop growing.

## 0.14.6 validation
- `npm run mo -- recommendation-review-save` now rewrites latest review rows in canonical `.TW` form and prefers `prices_daily` close lookup.
- Use `npx wrangler d1 execute ... "SELECT symbol, COUNT(*) AS rows, MIN(date), MAX(date) FROM prices_daily ..."` to confirm TW close backfill coverage after running the daily pipeline.

## 0.14.4 cycle + GPT layer
- LINE `ai 狀態`：用 GPT 解釋目前 cycle 是否卡在資料、報告、建議或模擬階段。
- LINE `ai 報告`：用 GPT 解釋最新 report 與 cycle 是否仍只屬資訊用途。
- LINE `ai 建議`：用 GPT 解釋目前 recommendation 是否已進入可操作 / 模擬階段。
- `狀態` 會額外顯示 `mo_cycle_state` 的 cycle/deadline/actionable 狀態。

- `npm run mo -- recommendation-scoreboard` now prints pipeline_readiness sections in 0.13.7.
recommendation-scoreboard now also prints symbol_repair_status_transitions, repair_transition_summary, and repair_transition_actions in 0.13.2.

0.13.0

0.12.8


## recommendation-scoreboard
- 0.12.7 起，輸出最後段除了 `gate_actionables` 外，還會新增：
  - `data_quality_summary`
  - `data_quality_findings`
  - `data_quality_actionables`
- 用於快速判斷目前 skip 主因是否為資料問題。
## recommendation-scoreboard
- 目前版本 0.12.6。
- 會輸出 checkpoint outcomes、classification、performance、rolling、execution summary、diagnosis、batch summary、top findings、actionable recommendations、skip reason normalization。


> 0.12.5: recommendation-scoreboard 新增 actionable_recommendations，可將 diagnosis / top findings 轉成下一步行動建議。

- `npm run mo -- recommendation-scoreboard`：在既有 summary / outcome metrics / classification / performance / rolling / execution summary 之外，新增各 checkpoint 的 diagnosis 區塊。

## 0.12.0 recommendation performance engine
- `npm run mo -- recommendation-scoreboard`：在既有 summary / outcome metrics / classification 之外，新增各 checkpoint 的 performance 與 rolling 區塊。
- `npm run mo -- baseline`：顯示 `BASELINE.json` 中的 locked baseline 資訊與指紋。

## 0.11.9 recommendation-scoreboard
- `npm run mo -- recommendation-scoreboard`：除了既有 summary 與 D0 / D5 / D10 / D20 outcome metrics，現在也會輸出各 checkpoint 的 `win / loss / flat` 與 execution status 切片。
## 0.10.0 note
- `debug / 除錯` 現在會顯示成本感知的 rejected / selected reason，例如 `qty_too_small`、`notional_too_small`、`edge_lt_cost`、`notional=... cost=...`。

# Commands

## 推薦用法
- `npm run mo -- doctor`
- `npm run mo -- smoke`
- `npm run mo -- autopilot`
- `npm run mo -- smoke-worker`
- `npm run mo -- logs`
- `npm run mo -- validate-artifacts`
- `npm run mo -- validate`
- `npm run mo -- guard`
- `npm run mo -- sanity`
- `npm run mo -- preflight`
- `npm run mo -- preflight-worker`
- `npm run mo -- runtime-invariants`
- `npm run mo -- portfolio-verify`
- `npm run mo -- recommendation-review`
- `npm run mo -- recommendation-review-save`
- `npm run mo -- autopilot`
- `npm run mo -- autopilot-worker`
- `npm run mo -- deploy`
- `npm run mo -- pack`
- `npm run mo -- patch`
- `npm run mo -- release`
- `npm run mo -- update`
- `npm run mo -- upgrade`（`update` 別名）

## 說明
- `doctor`：檢查 repo 結構與必要目錄
- `smoke`：在暫存 repo 驗證 sync-structure / doctor / pack / patch / release / update 流程
- `smoke-worker`：驗證 typecheck 與 Worker dry-run
- `logs`：追 Cloudflare Workers logs
- `validate-artifacts`：驗證 `.updates/outbox/` 結構與 release 檔名契約
- `validate`：自動執行 `guard -> sanity -> validate-artifacts`
- `guard`：檢查 MO_START / commands / scripts / artifact 契約是否齊備，專門攔截 AI 交付偏離流程的情況
- `sanity`：檢查版本、release notes、changelog、必要文件是否同步，作為 release 前最後一道 sanity check
- `preflight`：自動執行 `doctor -> smoke -> validate`
- `preflight-worker`：自動執行 `doctor -> smoke -> smoke-worker -> validate -> runtime-invariants`
- `runtime-invariants`：檢查 remote D1 的 `cash_twd / mo_positions / mo_execution_mark / mo_orders` 一致性
- `portfolio-verify`：驗證模擬資料層的 `mo_portfolio_state / mo_positions / mo_orders(EXECUTED) / mo_execution_mark(filled=1)` 閉環一致性
- `recommendation-review`：檢視最新推薦批次在 D0 / D5 / D10 / D20 的模擬表現（以 `twse_daily_raw` 快照回看）
- `recommendation-review-save`：把最新推薦批次的 review 結果落表到 D1（batch / item snapshot）
- `autopilot`：相容別名，行為同 `preflight`
- `autopilot-worker`：相容別名，行為同 `preflight-worker`
- `deploy`：部署 Worker
- `pack`：把 local 最新專案打包成 `.updates/outbox/market-observer_dev_latest.zip`
- `patch`：吃 `.updates/inbox/market-observer_patch_latest.zip`，只更新工具鏈與文件
- `release`：產出 `.updates/outbox/market-observer_release_latest.zip`
- `update`：吃 `.updates/inbox/market-observer_release_latest.zip`，建立 backup、套用到 repo root、歸檔到 `.updates/bak/`
- `upgrade`：相容別名，行為同 `update`


## LINE
- `狀態` / `mo status`
- `昨日報告` / `report`
- `建議` / `推薦`
- `universe` / `標的池`
- `debug` / `除錯`


## Release 驗證
- `npm run mo -- release`
- `npm run mo -- validate-artifacts`
- `npm run mo -- validate`
- `npm run mo -- guard`
- `npm run mo -- sanity`
- `npm run mo -- preflight`
- `npm run mo -- preflight-worker`
- `npm run mo -- runtime-invariants`
- `npm run mo -- portfolio-verify`
- `npm run mo -- recommendation-review`
- `npm run mo -- recommendation-review-save`
- `npm run mo -- autopilot`
- `npm run mo -- autopilot-worker`
- `npm run mo -- smoke`
- `npm run mo -- autopilot`

## PowerShell 驗證
- 查 universe：`npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT symbol, market, tier, enabled, created_at FROM etf_universe ORDER BY market, tier, symbol;"`
- 查最新建議：`npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT * FROM mo_orders ORDER BY id DESC LIMIT 10;"`
- 查 recommendation log：`npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT * FROM mo_recommendation_log ORDER BY id DESC LIMIT 10;"`

- 查 strategy debug：`npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT * FROM mo_strategy_debug ORDER BY id DESC LIMIT 20;"`

- `debug` / `除錯`: 查看 universe source、signal、candidate 數、recs 數與策略除錯摘要。

## 0.9.0 verification
- LINE: `狀態`, `建議`, `debug`, `universe`
- PowerShell: `npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT * FROM mo_strategy_debug ORDER BY id DESC LIMIT 20;"`

- `debug` / `除錯`：現在會在 candidate 與 rejected reason 中附帶 `px=<source>`，可直接看價格來源。


## mo portfolio-verify
- 驗證 Portfolio Closed Loop v2 的資料層一致性。
- 檢查 `mo_portfolio_state`、`mo_positions`、`mo_orders(status=EXECUTED)`、`mo_execution_mark(filled=1)`。
- 若尚無 executed orders，會顯示 skip 並成功結束。


## mo recommendation-review
- 預設檢視 `mo_recommendation_log` 最新一個 `rec_count > 0` 的推薦批次。
- 讀取同日 `mo_orders(side=BUY)` 作為推薦標的清單。
- 以 `entry_low/entry_high` 中位數作為基準價，回看 `twse_daily_raw` 的 D0 / D5 / D10 / D20 收盤表現。
- 若資料不足 20 個交易日，腳本會明確輸出 summary skip，而不是誤判失敗。

- `mo recommendation-review`：先用 `doctor` 驗證版本，再檢視最新推薦批次 D0/D5/D10/D20 表現；腳本會自動探測 `mo_orders` schema。


- `mo recommendation-review`：檢視最新推薦批次的 D0/D5/D10/D20 模擬表現，並輸出 `max_review_horizon`、`available_checkpoints`、`pending_checkpoints` 與各 symbol 的 review note。

## mo recommendation-review-save
- 會先執行與 `recommendation-review` 相同的計算。
- 接著自動建立（若不存在）`mo_recommendation_review_batches`、`mo_recommendation_review_items`。
- 之後用 `INSERT OR REPLACE` 寫入最新推薦批次的 review snapshot。

- `npm run mo -- recommendation-scoreboard`

- `recommendation-scoreboard`：彙總已落表的 recommendation review batch / item 統計，並輸出 D0 / D5 / D10 / D20 的 checkpoint outcome summary（evaluable / coverage / positive / positive_rate / average_return）。


0.12.3: batch-level summary + top findings added to recommendation-scoreboard.

- `npm run mo -- recommendation-scoreboard`：0.12.9 起會額外輸出 `data_coverage_map` 與 `repair_targets`。


0.13.4: blocked repair completion criteria added.

- `npm run mo -- recommendation-scoreboard` now prints strategy_evaluation_unlock sections in 0.13.6.


## 0.13.9
- Add operator final decision summary layer to recommendation-scoreboard.


### recommendation-review-save
- 0.14.8 起，執行前會先嘗試以 TWSE 月收盤資料回填 `prices_daily`，再計算 review。


## SIM_FILL_POLICY
- `STRICT_RANGE`：僅當價格觸發 entry range 時才模擬成交。
- `RANGE_OR_CLOSE`：若未觸發區間，回退到當日 close 模擬成交（預設）。
- `NEXT_OPEN`：若未觸發區間，回退到當日 open 模擬成交。


## review 子系統整理
- review / review-save / scoreboard / Worker `報告` 的責任分層，以 `docs/review_validation_architecture.md` 為準。
- `_recommendation_review_lib.mjs` 是唯一 review 計算核心；其他層只負責顯示、落表或統計。
