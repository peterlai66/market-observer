## 2026-03-15 — sizing / execution clarification in 0.19.29
- User explicitly requires recommendation quantity to be system-calculated, not ad-hoc or hand-tuned.
- Pending orders execute on the next trading day only; Friday batches must survive the weekend and expose an operator-visible next execution date so 3/13 -> 3/16 is not misread as a missing simulation run.

## 0.19.26
- Review runtime lookup is now centralized in `src/review/runtime.ts`; Worker report, AI payload, and admin diagnostics must share the same exact-match snapshot contract.
- `/admin/status` and `/admin/review/status` are now the canonical remote checks for confirming whether the current trade date has a same-cycle saved review or is still showing live projection only.

## 0.19.24
- Review snapshot lifecycle tightened: Worker report and AI payload may only read saved review batches/items whose `trade_date` exactly matches the current recommendation trade date; older dev snapshots must be ignored instead of being treated as fallback context.

- 0.19.22：review 子系統已有單一整理文件 `docs/review_validation_architecture.md`；之後若再改 review / review-save / scoreboard / Worker report，需先維持這份文件與程式責任一致。
- 0.19.22：Worker `報告` 的 review 區塊必須固定分成「可觀察進度 / latest saved review / projected horizon」三層，不可再混成一句話。
## 0.19.21
- Worker-side operator report no longer treats the most recently generated review snapshot as the sole truth when it belongs to an older trade date.
- If review-save has not yet refreshed the current trade date, LINE report should project horizon from live TW market dates and mark the snapshot as needing refresh.

## 0.19.20
- `push-only` 不能在 SKIP（例如摘要尚未 ready）時就寫入 `push_only_done=1`，否則同交易日後續 tick 會失去唯一一次真正推播機會。
- `adminPushOnly()` 現在會先檢查 `mo_tick_marks.push_only_done`，避免手動 `/admin/run?push=1` 或重入 tick 重複推播。
- timing hint 已改為優先學習近期 `summary=Y` / `rec=Y` tick milestone，而不是只看籠統的 `cycle=done` 時間。

## 0.17.3
- LINE `report` 已從工程格式調整為 human-readable operator narration。
- AI explain layer 現在有 webhook-safe timeout，`AI 報告 / AI 狀態 / AI 建議` 若 GPT 慢回會自動 fallback。

## 0.17.0
- LINE `report` now means latest operator report, not just yesterday TWSE summary.
- AI report payload includes latest cycle/review/recommendation context so GPT can explain current state instead of stale summaries.

## 0.16.1
- recommendation-review-save now respects review-side fill fallback when SIM_FILL_POLICY=RANGE_OR_CLOSE, promoting eligible D0 range misses into executed review samples for scoreboard accumulation.

## 0.14.9 AI memory note
- Treat pure `not-enough-trade-days` as coverage accumulation, not as a broken close-data pipeline, once D0 has been successfully computed.
- Use `coverage_accumulation_summary` to understand whether MO is waiting for future trade dates or still blocked by genuine data gaps.

## 0.14.8
- 0.14.6 failed feature validation because `recommendation-review-save` crashed on undefined helper functions; 0.14.8 restores those helpers so canonical `.TW` review persistence can run again.

## 0.14.6
- Root cause confirmed: review skip was driven by TW symbol canonical mismatch first, then by missing `prices_daily` close coverage.
- Current state: `.TW` canonical save path is fixed; next blocker is backfilling `prices_daily` for 00757.TW / 00919.TW and newer 00878.TW dates.

## 0.14.4
- MO 的 report 已重新定義為 daily cycle 的一部分，不再是 recommendation/simulation 的唯一前置條件。
- `mo_cycle_state` 會記錄 `waiting_data / report_ready / core_ready / actionable_ready / report_only / expired`。
- Tick 會在 14:30 到隔日 09:00 前持續重試；若 deadline 前仍未形成可操作訊號，cycle 會降級為 `report_only` 或 `expired`。
- GPT API 不直接決定交易，只做 cycle/status/report/recommendation 的解釋層。

## 0.14.2
- Added weekly operator message layer for report payload shaping and publish-ready messaging.

- 0.13.7 adds full pipeline readiness summary layer.
0.13.2 added symbol repair status transitions after repair_progress_actions.

0.13.0

0.12.8


## 0.12.7
- 最新 scoreboard 已加入 data quality action layer。
- 看見 `data_blocking_severity=CRITICAL/HIGH` 時，後續優先處理資料品質與 coverage，不先做策略最適化。
## 0.12.6
- scoreboard 已從 0.12.5 的 unknown skip reasons，升級為 structured normalization；必須保留 `review_note` 查詢，不能再漏掉。


> 0.12.5: recommendation-scoreboard 新增 actionable_recommendations，可將 diagnosis / top findings 轉成下一步行動建議。

- `mo recommendation-scoreboard` 現在除了 outcome / classification / performance / rolling / execution_summary，還會輸出 `diagnosis`。
- 0.12.2 的 diagnosis 會顯示 `dominant_status`、`gate_pressure`、`edge_state`、`horizon_signal_strength`、`execution_coverage_gap` 與 `interpretation`。
## 0.12.1
- `mo recommendation-scoreboard` 現在除了 outcome / classification / performance / rolling，還會輸出 `execution_summary`。
- `execution_summary` 會把每個 checkpoint 拆成 `overall / executed / skipped / pending` 四種視角，避免把 gate 擋單造成的 `0.00%` 誤讀成 recommendation 本身沒有 edge。


## 0.12.0
- 已完成 Recommendation Performance Engine。
- `recommendation-scoreboard` 新增 checkpoint performance 與 rolling summary。
- `BASELINE.json` 現在是 release 的正式一部分，`mo baseline` 可直接查看鎖定中的 baseline。

## 0.11.9
- 已完成 Recommendation Outcome Classification。
- `recommendation-scoreboard` 新增 `win / loss / flat` 與 `executed / skipped / pending` 切片輸出。
## 2026-03-08 — 0.11.8
- `recommendation-scoreboard` 已擴充 checkpoint outcome summary，可輸出 D0 / D5 / D10 / D20 的 evaluable / coverage / positive / positive_rate / average_return。
- 0.11.8 明確要求保留既有 summary 欄位，不可因 outcome metrics 擴充而破壞舊驗證流程。

## 2026-03-08 — 0.11.7
- `recommendation-scoreboard` 已驗證成功，可穩定輸出 batch / symbol / filled / skipped / pending / latest batch summary。
- handoff 時要明確保留 MO 的正確定位：Recommendation Validation Engine，不是交易系統。

## 2026-03-08 — 0.11.3
- `mo recommendation-review-save` 會把 CLI review 結果寫入 D1，作為後續 scoreboard 的正式資料來源。
- 若 review snapshot tables 不存在，腳本會自動 `CREATE TABLE IF NOT EXISTS`，不依賴先手動 migration。

## 2026-03-08 — 0.11.0
- 使用者再次明確定義：MO 不是交易系統；模擬下單/持倉/portfolio 屬於推薦驗證資料層，用來驗證 20 個交易日內推薦是否有效。
- 新增 `mo recommendation-review`，後續每輪推薦驗證都應優先使用這支腳本檢視 D0 / D5 / D10 / D20 表現。

## 2026-03-08 — 0.10.8
- `runtime-invariants` 首版曾因 `wrangler.jsonc` 是 JSONC 而在 `loadDbName()` 直接失敗。
- 之後凡是腳本需要讀取 `wrangler.jsonc`，都必須使用可容忍 JSONC 的解析方式，不可直接 `JSON.parse`。

## 2026-03-08 — 0.10.5
- 新增 `mo runtime-invariants`，作為 worker preflight 的資料一致性層。
- 之後若有 Worker / D1 / portfolio 相關 release，驗證時除了 `validate` / `preflight-worker`，還要明確提供 `runtime-invariants` 的預期結果。

## 2026-03-07 — 0.10.0
- User explicitly requires minimum trade size / cost-aware filtering so that fees and tax do not consume the trade's potential value.
- This rule is now treated as a hard runtime rule, not a later optimization.

# AI MEMORY

- 0.8.1 established the stable CLI/toolchain baseline.
- 0.8.3 connected D1 `etf_universe` to the strategy engine.
- 0.8.4 added `mo_strategy_debug` and LINE `debug / 除錯`.
- 0.8.5 added artifact validation to prevent release naming regressions.
- 0.9.0 adds snapshot backfill + starter fallback so candidate-rich days no longer stall at `recs=0` without visibility.

- 0.9.1 learned issue: universe candidates were valid but final recommendation close lookup failed; strategy now records explicit price-source fallback in debug output.

- 2026-03-08：MO 0.10.1 已修正同交易日重複建單，`mo_recommendation_log.note` 會帶 `inserted/deduped`；`mo_execution_mark` 會寫入 skipped/executed 結果。


## 0.10.2 workflow memory
- 使用者要求：每一輪 release 後先驗證與討論，再開始下一輪開發。
- 下一輪開發前，必須先由使用者提供 `market-observer_dev_latest.zip` 作為唯一基底。
- AI 不可在對話中貼大量程式碼；應直接改 dev 包並產出 `market-observer_release_latest.zip`。
- 新增 `mo guard` / `mo sanity` 以降低 AI 交付偏離流程的機率。


## 2026-03-08 — 0.10.3
- MO guardrail 第二階段新增 `mo autopilot` / `mo autopilot-worker`。
- 之後 release 驗證至少要跑 `autopilot`；若這輪改到 Worker / wrangler / migrations，則要跑 `autopilot-worker`。


## 2026-03-08 — 0.10.4
- 新增 `mo validate`、`mo preflight`、`mo preflight-worker`。
- `autopilot` / `autopilot-worker` 改為相容 alias，避免之後 preflight 與 autopilot 定義分叉。
- 之後 release 驗證至少要提供 `validate` 與 `preflight` 的執行與預期結果。


## 0.10.9
- 新增 `mo portfolio-verify`，後續每輪成交閉環驗收時，優先搭配 `mo runtime-invariants` 一起跑。

- 0.11.1：每次 release 必須先提供本輪實際改動檔案，並要求使用者先跑 `doctor` 驗版本，再跑目標腳本驗功能。


- 0.11.2：`recommendation-review` 需要先說明目前可回看交易日數，再輸出各 symbol 的 D0/D5/D10/D20；資料不足時要用清楚的 reason 標示，不可只顯示 `—`。

## 2026-03-08 — 0.11.6
- 新增 `mo recommendation-scoreboard`，後續批次推薦驗證將先看 scoreboard，再深入 individual review。


0.12.3: batch-level summary + top findings added to recommendation-scoreboard.

- 0.12.9：recommendation-scoreboard 已新增 data_coverage_map / repair_targets，可直接輸出 symbol 層級資料修復優先順序。


0.13.4: blocked repair completion criteria added.

- 0.13.6 adds strategy evaluation unlock layer.


## 0.13.9
- Add operator final decision summary layer to recommendation-scoreboard.


- 0.14.2: added weekly_delivery_formatting_summary / weekly_delivery_formatting_blocks / weekly_delivery_formatting_actions for LINE/email/log payload shaping.


- 0.14.8: review/save 內建 TW monthly close backfill，優先修復 `.TW` close 缺口，再進入 horizon coverage 判讀。

- FINMIND_TOKEN 透過 Cloudflare secret 提供，供 tradeDate backstop 驗證使用；不得寫入 repo 明文。

## 2026-03-15 0.19.28 runtime version source-of-truth
- User caught that `APP_VERSION` was still hand-written in `src/index.ts` even after patching mismatch symptoms.
- Fix direction is architectural, not cosmetic: `VERSION` must be the single source of truth; runtime version is now generated into `src/version.ts` and imported by Worker code.
- Future releases must not reintroduce scattered inline version constants inside runtime files.
