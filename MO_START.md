## 0.19.28 release note
- Runtime version is now generated into `src/version.ts`; `src/index.ts` imports `APP_VERSION` from that module instead of keeping a hand-edited inline constant.
- `scripts/sync-runtime-version.mjs` now treats `VERSION` as the single runtime version source and rewrites the generated module before `guard` / `deploy` / `release`.
- `scripts/guard.mjs` now fails if `src/version.ts` is missing, if `src/index.ts` stops importing it, or if generated runtime version drifts away from `VERSION`.

## 0.19.26 release note
- Added review audit helpers shared by Worker report and AI payload so exact-match saved review lookup is defined in one place instead of being duplicated in multiple modules.
- Add `/admin/review/status` plus extra review-alignment lines in `/admin/status` to remotely verify whether the current report is using an exact same-cycle snapshot or live projection.
- Continue review subsystem dedupe without changing runtime meaning: exact saved review / projected horizon / item lookup now follow the same helper contract.

## 0.19.24 release note
- Review snapshot selection is now exact-match only: Worker `報告` / AI payload / per-symbol review rows may only read `mo_recommendation_review_batches` and `mo_recommendation_review_items` whose `trade_date` exactly equals the current recommendation trade date.
- Old fallback `trade_date <= referenceTradeDate` is forbidden for saved review rendering because it leaks stale dev snapshots (for example `2026-03-06`) into newer cycles like `2026-03-13`.
- If the current recommendation trade date has no saved snapshot yet, report must say `尚未建立 saved review` and rely on projected horizon only.

## 0.19.22 release note
- Worker `報告` 的 review 區塊改為分層顯示：目前可觀察進度 / 最新 saved review / projected horizon，不再把不同責任層混成一段文案。
- 新增 `docs/review_validation_architecture.md`，明確定義 review / review-save / scoreboard / Worker report 的責任分工與資料契約。
- 後續 review 子系統整理必須以 `_recommendation_review_lib.mjs` 為唯一計算核心，避免重複在 Worker 或 scoreboard 重新實作 checkpoint 規則。

## 0.19.21 release note
- Worker-side report/status must no longer be pinned to an older saved review batch when cycle/recommendation already advanced to a newer trade date.
- Review progress should auto-project from live market dates for the current reference trade date, while clearly marking that per-symbol review items still need a later review-save refresh.
- Latest saved review batch lookup should prefer newest `trade_date` first, then `review_generated_at`, so reruns on old batches do not override newer operator context.

## 0.19.20 release note
- `push-only` 只有在 LINE 真正推播成功後才可寫入 `push_only_done=1`；不能因為 16:00 第一輪尚未有摘要就提前封存當日 push。
- `adminPushOnly()` 內部必須自帶 duplicate push guard，避免 tick/admin 重入造成同交易日重複推播。
- timing guidance 應優先從近期 `summary=Y` / `rec=Y` tick 里程碑學習，只有樣本不足時才 fallback 到粗略 `cycle=done` 平均值。

## 0.19.13 release note
- Restore concrete `buildMarketTimingHint()` runtime helper so LINE `status` / `report` can safely render timing guidance.
- `push-only` must hard-skip Saturday/Sunday and any tradeDate that is not the latest completed TW trading date.
- Timing guidance may learn from recent tick audit windows when available, but must always have a safe default fallback.

## 0.19.12 handoff note
- Latest user-validated local/remote target is v0.19.12 and future work must start from the user's newest `market-observer_dev_latest.zip`, not from older release/handoff zips.
- Weekend push bug observed: a Saturday 16:00 LINE push still emitted `台股盤後總結（2026-03-14）`; next fix must add strict Trading Day Guard + Data Date Guard + Duplicate Push Guard before any new feature work.
- LINE runtime bug observed after deploy: `status` / `report` could fail with `buildMarketTimingHint is not defined` while `help` still worked; investigate runtime bundling / helper scope before continuing product work.
- LINE is now the primary operator surface. `狀態 / 報告 / 建議 / 持倉 / 幫助` must remain case-insensitive and consistent with actual strategy state.

## 0.19.8 release note
- LINE operator commands (`狀態` / `最新報告` / `建議`) must prioritize latest signal batch state and portfolio state so Monday verification can be done directly in LINE without web endpoints.

## 0.19.6 release note
- Add `/admin/simulation/commit` to commit the latest preview batch into sandbox execution state for controlled weekend verification.
- Add `/admin/simulation/reset` to restore pre-commit orders/portfolio and clear sandbox state before Monday's formal run.
- `/admin/status` must show `sandboxSnapshot=...` so remote state makes active sandbox writes obvious.


## 0.19.5 release note
- Runtime version endpoints must use the current release version; `/admin/version`, `/admin/status`, `/admin/simulation/preview`, and `/admin/run` may not lag behind `VERSION` / `package.json`.
- Add `/admin/execution/audit` to compare preview vs actual execution results by symbol for the latest signal batch.
- `/admin/status` should expose latest signal batch totals (pending/executed/skipped) so remote state is readable even when cycle date differs from signal date.

## 0.19.4 release note
- Add `/admin/status` as the canonical remote runtime heartbeat for cycle/tick/pending/executed/portfolio state.
- Add `/admin/simulation/preview` as a non-destructive simulation dry-run for the latest pending recommendation batch; sandbox validation must not mutate Monday's first formal run.

## 0.19.3 release note
- Version numbers are single-use release identities. Once any release labeled `X.Y.Z` has been delivered to the user, later fixes must advance to the next patch version instead of reusing the same label.
- Operator report header must follow the latest market trade date, not merely the latest open cycle date.
- Weekend/non-trading-day report validation must resolve the latest completed trading date using explicit Asia/Taipei date parts.

## 0.17.8 release note
- TWSE legacy MI_INDEX backstop must probe around the freshest primary trade date (not current day first) and may only advance the resolved trade date by at most +1 day.

## 0.17.0 release note
- Latest report delivery must show newest cycle/review operator state, not only the newest `twse_daily_summary` row.
## 0.16.1
- recommendation-review-save now respects review-side fill fallback when SIM_FILL_POLICY=RANGE_OR_CLOSE, promoting eligible D0 range misses into executed review samples for scoreboard accumulation.

## 0.14.9 note
- `recommendation-scoreboard` must distinguish normal future-day accumulation from true data repair.
- When D0 is already valid and only later checkpoints are waiting on future trade dates, treat the state as `COVERAGE_ACCUMULATION`, not a broken pipeline.

## 0.14.8
- Release hotfix only: restore review helper functions required by `recommendation-review-save`; do not treat 0.14.6 as stable without rerunning the save step.
- Development baseline rule: every release must lock baseline metadata; if no new dev package is uploaded later, continue only from the last locked release.

## 0.14.6
- Treat `prices_daily` as the primary TW close evaluation table for recommendation review.
- Daily pipeline must keep `prices_daily` current for active-universe TW symbols, while review-save remains canonical-symbol only (`XXXX.TW`).

## 0.14.4
- Add daily cycle engine foundation and cycle-aware GPT explanation commands.

## 0.14.2
- Added weekly operator message layer for report payload shaping and publish-ready messaging.

Version: 0.13.8

Current version baseline: 0.13.2
Latest scoreboard layers include symbol repair transition tracking.

0.13.0

# MO Current Release Baseline
- Version: 0.13.0
- Theme: Repair Progress / Blocker Clearance
- Rule: 0.12.5 的 skip reason breakdown 已知曾因 query 未帶 `review_note` 而全部落在 `unknown / other`；後續不得移除此欄位。


> 0.12.5: recommendation-scoreboard 新增 actionable_recommendations，可將 diagnosis / top findings 轉成下一步行動建議。

## Runtime trading rules (0.10.0)
- Recommendation and execution must reject trades that are too small to survive costs.
- Minimum trade quantity / notional and transaction cost checks are part of the strategy, not optional UI hints.
- Any future change to recommendation sizing must preserve cost-aware guards and update docs/BUGS.md / CHANGELOG.md / RELEASE_NOTES.md together.

# MO_START

這是 Market Observer (MO) 專案的唯一入口文件。任何 AI 接手本專案時，必須先讀本文件，再讀 `docs/PROJECT.md`、`docs/AI_MEMORY.md`、`docs/NEXT_TASK.md`、`docs/BUGS.md`、`developer/SCRIPTS_GUIDE.md`。

## 1. 核心原則
- 使用者只負責提需求、定框架、做線上驗收；不手動改程式。
- AI 負責實作、同步文件、產出 release / patch / handoff。
- 一般交付一律提供可透過 `mo update` 套用的 release zip。
- 只有使用者明確輸入 `handoff` 時，才進入交接流程並產出 handoff 包。
- 所有已定案流程與規格都要同步寫入文件，不可只留在聊天室。
- 每次 release 必須同步更新相關文件，不可只改程式不改文件。
- 所有新發現 bug 必須寫入 `docs/BUGS.md`。

## 2. 基線與回歸防護
- Release 正式交付檔名必須固定為 `market-observer_release_latest.zip`；任何版本號式 release 檔名都視為交付失敗。
- 每次產出 release 後都必須先通過 `mo validate-artifacts`，再視為可交付。
- 所有後續開發都必須建立在最近一次成功通過 `mo update`、`mo smoke`、`mo deploy` 的版本上。
- `scripts/`、`package.json`、`MO_START.md`、`docs/commands.md`、`developer/SCRIPTS_GUIDE.md` 視為 toolchain 必檢區。
- `pack` / `pack:release` / `pack:patch` 若新增 root-level 文件或設定檔，必須能自動帶入 artifact；不可只靠人工維護靜態清單。
- 已存在的正式 CLI 指令不可無故消失，尤其是：`mo doctor`、`mo smoke`、`mo smoke-worker`、`mo guard`、`mo sanity`、`mo validate`、`mo preflight`、`mo preflight-worker`、`mo runtime-invariants`、`mo portfolio-verify`、`mo recommendation-review`、`mo recommendation-review-save`、`mo autopilot`、`mo validate-artifacts`、`mo deploy`、`mo logs`、`mo update`。
- 交付判定以使用者 update 後實際拿到的內容為準，不以聊天室描述為準。

## 3. update / deploy 分流
- `update`：把 release / patch 套用到 local repo。
- `deploy`：把 Worker 發佈到 Cloudflare。
- 若 release 包含 `src/`、`wrangler.jsonc`、`migrations/`、`worker-configuration.d.ts`，update 後必須 deploy。

## 4. 測試流程
### 工具鏈 / 文件修改
- `npm run mo -- smoke`
- `npm run mo -- guard`
- `npm run mo -- sanity`
- `npm run mo -- update`
- `npm run mo -- autopilot`

### Worker 程式修改
- `npm run mo -- smoke`
- `npm run mo -- smoke-worker`
- `npm run mo -- guard`
- `npm run mo -- sanity`
- `npm run mo -- update`
- `npm run mo -- autopilot-worker`
- `npm run mo -- deploy`

## 5. outbox 結構契約
- 所有最新 zip 一律放在 `.updates/outbox/` 根目錄。
- 只靠檔名區分用途：`market-observer_dev_latest.zip`、`market-observer_patch_latest.zip`、`market-observer_release_latest.zip`、`mo_handoff_*.zip`。
- AI 交付 release 時，不可改用 `market-observer_release_<version>.zip` 之類名稱。
- `.updates/outbox/dev`、`.updates/outbox/patch`、`.updates/outbox/release`、`.updates/outbox/handoff` 都是廢棄結構，update / patch / sync-structure 必須自動刪除。
- `.updates/outbox/bak/` 保留作為舊 `_latest.zip` 的歸檔位置。


## 5A. 開發循環規則
- 每次 release 交付後，先做驗證與討論，再決定下一輪架構 / 功能。
- 每次 release 交付時，AI 必須先列出本輪實際改動檔案；至少包含目標腳本、VERSION、package.json、CHANGELOG.md、RELEASE_NOTES.md。
- 每次 release 驗證時，第一步固定為 `npm run mo -- doctor`；若版本號未更新到本輪版本，不得繼續做功能驗證。
- 未經版本驗證與目標腳本驗證，不得宣稱「已完成修正」或「已完成開發」。
- 若本輪目標是修某支腳本，交付後第一個功能驗證必須只驗那支腳本，不可一開始就要求使用者跑大範圍驗證鏈。
- 下一輪開始開發前，使用者必須先提供 `market-observer_dev_latest.zip`。
- AI 必須以使用者提供的 dev 包為基底實作，並把聊天室已定案內容同步寫入文件。
- AI 不可跳過 dev 包直接假設 repo 狀態；若沒有 dev 包，不得聲稱已完成可 update 的 release。
- release 交付檔名固定為 `market-observer_release_latest.zip`，不可要求使用者手動改名補救。


## 5B. Baseline lock rule
## 5C. Version uniqueness rule
- 版本號是 release 身分，不是暫存標籤；同一個版本號一旦對使用者交付過，就不得再次用於不同內容的 release。
- 若 `0.19.3` 已經交付，而後又發現還要補修，即使只是 hotfix，也必須升為 `0.19.4`。
- `market-observer_release_latest.zip` 檔名可固定，但 zip 內的 `VERSION`、`package.json`、`BASELINE.json`、`CHANGELOG.md`、`RELEASE_NOTES.md` 必須同步反映新的唯一版本號。
- handoff / dev / release 的 baseline 可延續，但 release 版號不得回填、覆寫、重用。

- 每次 release 前必須重寫 `BASELINE.json`，並把當前版本標記為 locked baseline。
- 下一輪開發的基底優先順序固定為：使用者最新提供的 `market-observer_dev_latest.zip` → 最近一次成功 release 的 `market-observer_release_latest.zip`。
- 舊 handoff 包只能作為脈絡參考，不得再當成實際開發 base。
- `mo baseline` 必須能直接顯示目前 locked baseline 與指紋，避免版本鏈混亂。

## 6. D0~D19 的正式定義
- D0~D19 代表 20 個交易日的模擬週期。
- D0 = 模擬第 1 個交易日，D1 = 模擬第 2 個交易日，依此類推。
- 不要把 D0 / D1 理解成市場慣例的當日 / 次日術語。

## 7. 主循環
- Execution fill policy 預設為 `RANGE_OR_CLOSE`；可用 Worker env `SIM_FILL_POLICY=STRICT_RANGE|RANGE_OR_CLOSE|NEXT_OPEN` 覆寫。
1. 取得最新可用交易日市場資料。
2. 生成該交易日盤後報告。
3. 根據盤後報告產生買進 / 賣出建議。
4. 下一個交易日用最高 / 最低價模擬是否成交。
5. 更新模擬持倉與績效，持續滾動。

## 8. 非交易日規則
- 週末 / 國定假日不生成新的盤後報告。
- 查詢盤後報告時，顯示最近交易日的報告。
- 若最近交易日摘要尚未生成，系統應補寫該交易日摘要，而不是直接回空。

## 9. handoff 流程
1. 使用者 local 執行 `npm run mo -- pack`。
2. 使用者上傳 `market-observer_dev_latest.zip`。
3. 使用者輸入 `handoff`。
4. AI 必須先比對 repo、文件、規則、已知 bug、未完成功能。
5. AI 補齊可補項，並列出未完成事項。
6. AI 產出新的 handoff 包：`mo_handoff_YYYYMMDD_HHMM.zip`。
7. 新視窗輸入：`讀取檔案中的 MO_START.md 並繼續開發專案`。

## 10. Strategy Universe
- Universe 來源優先順序：`MO_UNIVERSE` → D1 `etf_universe(enabled=1)` → 預設 ETF universe `0050`、`006208`、`0056`、`00878`、`00919`。
- 推薦流程必須優先使用 universe，而且要從當日 `stocksAll` 全量快照建立候選；只有當日無快照時才可 fallback 到成交值排行。
- universe / fallback 狀態要同步寫入 log 與文件。


## Release delivery rule
- When a feature changes LINE behaviour or strategy logic, release notes must include LINE 驗證指令、預期結果、必要的 D1 / log 驗證方式。
- Newly discovered bugs must be recorded in `docs/BUGS.md`.


## 0.9.0 Strategy baseline
- The latest verified development baseline is 0.9.0.
- For functionality releases, always include LINE verification steps (`狀態`, `建議`, `debug`, `universe`) and any required PowerShell D1 commands.
- Strategy releases must update RELEASE_NOTES / CHANGELOG / BUGS / NEXT_TASK together.

- When a strategy change depends on price fields, release notes and debug output must state the exact fallback order for price resolution.

## 0.10.3 toolchain autopilot
- 新增 `mo autopilot`：固定串 `doctor -> smoke -> guard -> sanity`。
- 新增 `mo autopilot-worker`：固定串 `doctor -> smoke -> smoke-worker -> guard -> sanity`。
- 目的是把每輪 release / deploy 前的例行巡檢變成單一指令，減少 AI 漏跑檢查。

## 0.10.4 validate/preflight
- 新增 `mo validate`：固定串 `guard -> sanity -> validate-artifacts`，把 release 契約檢查收斂成單一指令。
- 新增 `mo preflight`：固定串 `doctor -> smoke -> validate`。
- 新增 `mo preflight-worker`：固定串 `doctor -> smoke -> smoke-worker -> validate`。
- `mo autopilot` / `mo autopilot-worker` 改為相容別名，內部轉呼叫 preflight 流程，避免巡檢定義分叉。


## 0.10.8 runtime-invariants parser fix
- `mo runtime-invariants` 必須能正確解析 `wrangler.jsonc`（含註解與 trailing comma）；若腳本需要讀設定檔，不可直接對 JSONC 使用 `JSON.parse`。
- `mo preflight-worker` / `mo autopilot-worker` 的驗收前提，是 `runtime-invariants` 能先單獨成功。

## 0.10.5 runtime invariants
- 新增 `mo runtime-invariants`：直接檢查 remote D1 的 `cash_twd`、`mo_positions`、`mo_execution_mark`、`mo_orders` 一致性。
- `mo preflight-worker` / `mo autopilot-worker` 現在必須把 runtime invariants 一起跑完，deploy 前不只驗工具鏈，也驗資料層。
- Runtime invariants 至少要攔下：負現金、非有限/非正持倉、portfolio snapshot 缺失或落後 execution mark、`EXECUTED` 缺 `exec_date`。


## 0.10.9 portfolio verify
- 新增 `mo portfolio-verify`：直接檢查 remote D1 的 `mo_portfolio_state`、`mo_positions`、`mo_orders(status=EXECUTED)` 與 `mo_execution_mark(filled=1)` 是否彼此一致。
- 若目前尚無 executed orders，腳本必須明確輸出 skip，而不是把空狀態誤判為錯誤。
- FS-01 Portfolio Closed Loop v2 的資料層驗收，優先使用 `mo runtime-invariants` + `mo portfolio-verify`。

## 0.11.0 recommendation review
- MO 不是實盤交易系統；portfolio / orders / execution marks 在此專案中屬於推薦驗證用的模擬資料層。
- 新增 `mo recommendation-review`：用最新推薦批次檢視 D0 / D5 / D10 / D20 表現，驗證推薦標的是否有效。
- 推薦驗證優先看 `mo recommendation-review` 與 `mo portfolio-verify`，而不是把 MO 解讀成真實交易執行系統。

## 0.11.1 delivery proof + recommendation review schema guard
- `mo recommendation-review` 不可假設 `mo_orders` 存在 `score` 等非必要欄位；查詢前必須先以 schema 探測決定可用欄位。
- 每次 release 交付都必須先附「本輪實際改動檔案」與「先驗版本、再驗功能」的驗證順序。

## 0.11.2 recommendation review clarity
- `mo recommendation-review` 的輸出必須先說明目前可回看交易日數與可用 checkpoint；資料不足時要明確區分 `not-enough-trade-days`、`missing-close`、`signal-generated-but-not-filled`。

## 0.11.3 recommendation review snapshot
- 新增 `mo recommendation-review-save`：把最新推薦批次 review 結果正式落表到 D1。
- 之後推薦驗證不只看 CLI 報表，也要能查 snapshot tables。

## 11. Recommendation validation CLI
- `mo recommendation-review`：檢視最新推薦批次的 checkpoint 表現。
- `mo recommendation-review-save`：將 review 結果正式落表。
- `mo recommendation-scoreboard`：彙總已落表的 review batch / item 統計。

## 0.11.8 recommendation outcome metrics
- `mo recommendation-scoreboard` 後續擴充時，必須保留既有 summary 欄位。
- 0.11.8 起 scoreboard 會額外輸出 D0 / D5 / D10 / D20 的 `evaluable`、`coverage`、`positive`、`positive_rate`、`average_return`。
- Outcome metrics 屬於推薦驗證統計，不可解讀為真實交易績效結算。

## 0.11.9 recommendation outcome classification
- `mo recommendation-scoreboard` 必須在保留既有 summary 與 0.11.8 outcome metrics 的前提下，新增 checkpoint classification 區塊。
- 每個 checkpoint 需額外輸出 `win / loss / flat` 與 `win_rate / loss_rate / flat_rate`。
- 每個 checkpoint 需額外輸出 `executed / skipped / pending` 切片的 `evaluable` 與 `average_return`，幫助辨識 `+0.00%` 是否只是 status 混合或樣本特性。
- Outcome classification 屬於推薦驗證統計，不可解讀為真實交易績效結算。

## 0.12.1 execution-aware performance summary
- `mo recommendation-scoreboard` 在保留既有 summary / outcome metrics / classification / performance / rolling 的前提下，新增 `execution_summary` 區塊。
- 每個 checkpoint 額外輸出 `overall / executed / skipped / pending` 的 `evaluable`、`share_of_evaluable`、`average_return`、`positive_rate`、`win_rate`、`loss_rate`、`flat_rate`、`expectancy`、`decisive_rate`。
- 用途是分清楚 recommendation edge 與 execution gate 的影響，不可把 skipped / pending 的統計誤解為真實成交績效。

## 0.12.2 recommendation diagnosis layer
- `mo recommendation-scoreboard` 在保留既有 summary / outcome metrics / classification / performance / rolling / execution_summary 的前提下，新增 `diagnosis` 區塊。
- 每個 checkpoint 額外輸出 `dominant_status`、`dominant_status_share`、`gate_pressure`、`edge_state`、`horizon_signal_strength`、`execution_coverage_gap`、`interpretation`。
- diagnosis 用途是協助判讀 recommendation edge 與 execution gate 哪個主導結果，不可把 diagnosis 直接當成交易決策或實盤績效結論。

## 0.12.0 recommendation performance engine
- `mo recommendation-scoreboard` 在保留既有 summary / outcome metrics / classification 的前提下，新增 checkpoint performance 區塊。
- 每個 checkpoint 額外輸出 `expectancy`、`avg_win_return`、`avg_loss_return`、`edge_ratio`、`nonflat_evaluable`、`decisive_rate`。
- 每個 checkpoint 額外輸出 rolling 視角（`last_1_batch` / `last_3_batch` / `last_5_batch`）的 evaluable、average_return、positive_rate。
- 0.12.0 起 release 必須內含 `BASELINE.json`，作為 locked baseline manifest。


0.12.3: batch-level summary + top findings added to recommendation-scoreboard.

## 0.12.7 focus
- Recommendation Validation Engine 持續擴充為可操作的診斷報表層。
- 最新版本新增 `data_quality_summary`、`data_quality_findings`、`data_quality_actionables`，用來判讀 skip 主因是否來自 `missing-close`、`not-enough-trade-days` 等資料問題。
- 若 data quality 層顯示資料阻塞為主，優先修資料，不要先調 ranking / gate / edge 參數。


- Current validated release: 0.12.9 (Data Coverage Map / Repair Targets).


0.13.4: blocked repair completion criteria added.


## 0.13.9
- Add operator final decision summary layer to recommendation-scoreboard.


- 0.14.2: added weekly_delivery_formatting_summary / weekly_delivery_formatting_blocks / weekly_delivery_formatting_actions for LINE/email/log payload shaping.


### 0.14.8 note
- `recommendation-review-save` 會在 review 前先嘗試回填 TW 月收盤資料到 `prices_daily`。
- 後續若仍卡 `not-enough-trade-days`，表示 symbol / helper / join 已通，剩下的是時間覆蓋問題。

- tradeDate engine：TWSE OpenAPI 為主，TWSE legacy 與 FinMind 為 backstop；遇到日期衝突時不得靜默採用較新日期，須留下 log。
- 最新報告日期：不得只看 review batch，需以最新 cycle / recommendation / summary 綜合判定。


- 0.18.0：FinMind trade-date backstop 改用 TaiwanStockTradingDate；legacy probe 以 anchor+1 為優先，不得讓單一來源前進超過 1 天。


## v0.19.11
- Added admin exit sandbox preview endpoint for pretesting exit logic before live market data.
