## 0.19.29
- add(portfolio): introduce `src/portfolio/position_sizing.ts` so recommendation quantities are derived from deploy ratio / capped weights / lot constraints instead of ad-hoc inline math
- improve(recommendation): BUY reasons and debug rows now include explicit sizing diagnostics (`deploy`, `target`, `weight`, `qty`, `notional`) for remote validation
- improve(status): `/admin/status`, LINE `狀態`, and `報告` now show the next planned simulation execution date for pending batches, clarifying weekend skips such as Friday -> Monday

## 0.19.28
- Replace hand-written `APP_VERSION` constant in `src/index.ts` with generated `src/version.ts`.
- Make `VERSION` the single runtime version source for `guard` / `deploy` / `release`.
- Tighten `scripts/guard.mjs` so version drift is blocked before deployment.

## 0.19.27
- 修正 runtime APP_VERSION 與 VERSION / package.json 不一致問題。
- 新增 scripts/sync-runtime-version.mjs，於 mo guard / mo deploy / mo release 自動同步 runtime 版本。
- guard 新增 APP_VERSION 與 VERSION 一致性檢查，避免舊版字串被帶上線。

## 0.19.26
- refactor(review): centralize exact-match saved review lookup and projection helpers in `src/review/runtime.ts` so Worker report and AI payload cannot drift
- feat(admin): add `/admin/review/status` and extend `/admin/status` with review alignment diagnostics for remote verification
- docs(review): advance NEXT_TASK / AI_MEMORY / BUGS / MO_START to reflect the new review observability contract

## 0.19.25
- fix(report): only load saved review snapshots whose `trade_date` exactly matches the current recommendation trade date, so stale batches like `2026-03-06` can no longer leak into the 2026-03-13 report
- fix(report): review detail rows now follow the same exact-match rule, avoiding cross-cycle item pollution in LINE report and AI payloads
- cleanup(review): remove the old `trade_date <= referenceTradeDate` fallback from Worker report selection logic to make review snapshot lifecycle explicit

## 0.19.25
- refine(report): split review progress in LINE report into observable progress / latest saved review / projected horizon
- docs(review): add a canonical review validation architecture document to define ownership, source-of-truth tables, and future cleanup rules
- cleanup(worker): centralize review progress line formatting so future report changes do not duplicate wording logic

## 0.19.25
- fix(report): review progress in LINE report now follows the current reference trade date instead of being pinned to an older saved review batch
- fix(worker): review horizon can auto-project from live market dates when the latest saved snapshot is stale or from another trade date
- fix(review): latest saved review batch lookup now prefers newest trade_date before review_generated_at

## 0.19.25
- fix(push-only): only mark `push_only_done=1` after a real LINE push succeeds, so Friday summary pushes are not prematurely skipped when the first 16:00 tick still lacks a ready summary.
- fix(push-only): add duplicate-push guard inside `adminPushOnly()` so manual/admin re-entry also respects the one-push-per-trade-date rule.
- improve(status): learn timing windows from recent `summary=Y` / `rec=Y` tick milestones before falling back to coarse `cycle=done` averages.

## 0.19.25
- fix: reference trade date now follows latest available recommendation / signal / cycle / review data instead of being blocked by summary generation state
- fix: market summary date is now independent from the main report date, so missing summary generation no longer forces status/report back to an older trade date
- improve(status): explicitly show when summary is lagging behind the main reference trade date instead of pretending newer data does not exist

## 0.19.25
- fix: resolve effective trade date from latest valid summary/cycle/recommendation on or before latest completed trading date, instead of relying on mo_daily_mark FULL rows
- fix: non-trading-day status/report summary, cycle, and report header now align to the same effective trade date source
- cleanup: add shared latest-date query helper for trade-date normalization

## 0.19.25
- fix: deploy build regression from await inserted into non-async helper
- fix: status/report summary and cycle header now align to effective trade date on or before latest FULL mark
- refactor: add effective trade date helpers for summary/cycle selection

## 0.19.25
- fix(line): restore missing `buildMarketTimingHint()` so LINE `status` / `report` no longer throw at runtime
- fix(push): block weekend / non-trading-day `push-only` summary sends and require summary date/header to match the latest completed TW trading date
- improve(status): surface operator timing window state using recent tick audit data when available, otherwise fallback to default post-close windows

## 0.19.25
- add learned post-close timing hints for status/report and user expectation windows

## 0.19.25
- add exit sandbox preview for pretesting position/exit logic
- bump runtime and package version

## 0.19.25
- Add LINE portfolio/持倉 command
- Keep LINE/CLI command handling case-insensitive

## 0.19.25
- CLI 指令改為不區分大小寫。
- LINE 指令統一為狀態 / 報告 / 建議 / help，並改為不區分大小寫與多餘空白。
- LINE 報告與建議文案改為以資料截至日顯示，避免週末/隔日混淆。

## 0.19.25
- LINE 狀態 / 建議 / 最新報告 改以最新 signal batch + 策略池為主，讓週一可直接從 LINE 讀到待成交與模擬狀態。
- 新增 latest signal/portfolio 快速視圖，LINE 指令不再依賴 web admin 狀態判讀。

## 0.19.25
- add(admin): add `/admin/simulation/commit` to write the latest preview batch into sandbox execution state using synthetic touch rows
- add(admin): add `/admin/simulation/reset` to restore pre-commit portfolio/orders and clear sandbox execution marks
- improve(status): expose `sandboxSnapshot=...` in `/admin/status` so remote state shows whether weekend sandbox state is still active

## 0.19.25
- Fix runtime version constant so `/admin/version`, `/admin/status`, `/admin/simulation/preview`, and `/admin/run` all report the deployed release version consistently.
- Add `/admin/execution/audit` to diff synthetic preview events against actual `mo_orders` execution results for the latest signal batch.
- Expand `/admin/status` with `latestSignal=... pending/executed/skipped` so remote state can be read without guessing from cycle flags alone.

## 0.19.25
- feat(admin-status): add `/admin/status` so remote runtime can expose the latest cycle, tick, pending/executed order, portfolio, and simulation-preview readiness in one place.
- feat(simulation-preview): add `/admin/simulation/preview` to dry-run the latest pending recommendation batch with synthetic touch prices, verifying fill / cash / position transitions without mutating D1 state.
- chore(sim-validation): keep the preview path non-destructive so weekend sandbox checks do not contaminate Monday's first formal simulation run.

## 0.19.25
- fix(report-validator): report validity now accepts any source-aligned latest available trade date, and only blocks when data is stale versus the latest completed TW trading date or when index/snapshot sources are misaligned.
- fix(cycle-order): `getLatestOpenCycle()` now reads the newest active cycle (`ORDER BY trade_date DESC`), so operator/status views no longer pin to an older open cycle.
- feat(admin-version): add `/admin/version` and include `version=` in `/admin/run`, so remote runtime can be verified directly after deploy.
- chore(toolchain): restore `.updates/README.md` and required `.updates/*` structure in the packaged baseline.
## 0.19.25
- fix(report-validator): accept the latest completed trading date as `VALID` when summary, snapshot, and index sources are aligned, including weekend / non-trading-day runs.
- fix(report-header): operator report header now uses `資料截至 YYYY-MM-DD` when the latest valid trade date differs from the current calendar date.
- fix(review-horizon): LINE operator report now auto-projects review horizon from available market dates instead of staying pinned to an older saved review batch.
- fix(toolchain): restore `.updates/README.md` so `mo doctor` passes again in packaged baselines.

## 0.19.25
- Added REPORT_GATE / PUSH_GATE / RECOMMENDATION_GATE so incomplete reports no longer push LINE or emit actionable recommendations.
- Removed the fixed one-line market commentary from the generated summary.
- `/admin/run` now reports `reportStatus`, `recStatus`, and `execDate` based on final gate outcomes.

## 0.18.0
- fix(trade-date): legacy MI_INDEX probes now prioritize `anchor+1` and ignore candidates more than one day ahead of the primary anchor.
- fix(finmind): switch backstop dataset from `TaiwanStockPrice` to `TaiwanStockTradingDate`, and treat auth/plan rejection as soft-unavailable instead of poisoning quorum.

## 0.17.9
- tradeDate engine 新增 FinMind backstop，並將 legacy 探測改為包含 today / today-1，避免 3/11 凌晨仍停在 3/9。
- 最新報告改為優先使用最新 cycle / recommendation / summary 日期，不再被舊 review batch 綁回 3/6。

## 0.17.8
- fix(twse): legacy MI_INDEX probe now anchors to the freshest primary trade date and only accepts at-most +1 day backstop results, preventing false jumps to today.
- logs(twse): add legacy probe anchor/probe/delta logging so remote /admin/run can explain why a legacy date was accepted or ignored.

## 0.17.7
- Fix TWSE trade-date resolution: FMTQIK / STOCK_DAY_ALL now take the latest distinct date instead of the first row, and MI_INDEX legacy date probes are used as a freshness backstop.
- Pack scripts now auto-include root repo files, reducing the chance that newly added baseline/docs/config files are omitted from dev/release/patch artifacts.

## 0.17.6
- fix(ai): 預設 OpenAI model 改為 gpt-4o-mini，並由 wrangler vars 明確鎖定 AI_ENABLED=1 / OPENAI_MODEL=gpt-4o-mini。
- fix(ai): `ai 狀態 / ai 報告 / ai 建議` 現在會把最近一次 AI 呼叫結果落表到 `mo_ai_audit`，可追查是否真的呼叫、是否成功、耗時多久、是否拿到回應。
- fix(ai): webhook 內 AI timeout guard 縮短為 1.2 秒，避免 LINE 因等待 GPT 而更容易 cancel。

## 0.17.3

- LINE `report / 最新報告 / 本週報告` 改成 human-readable operator narration，主畫面優先顯示結論、驗證進度、重點標的與下一步，不再先丟工程欄位。
- LINE `AI 報告 / AI 狀態 / AI 建議` webhook timeout guard 從 8.5 秒縮短到 2.5 秒，並對 OpenAI 呼叫加上 2.2 秒 abort，避免 reply 被卡住。
- 新增 `AI報告 / AI狀態 / AI建議` 與 `GPT報告 / GPT狀態 / GPT建議` 無空白別名，降低 LINE 指令輸入失敗率。

## 0.17.2

- 修正 LINE「AI 報告 / AI 狀態 / AI 建議」在 OpenAI 慢回或逾時時無回覆的問題。
- 新增 OpenAI 回應 8 秒 timeout guard。
- AI 逾時或失敗時，自動 fallback 為內建摘要並照常回 LINE。

## 0.17.1
- 修正 LINE `report / 最新報告 / 本週報告` 指向最新 MO operator report，而非僅顯示舊的台股盤後摘要。
- `ai 報告` payload 補入最新 cycle / review / recommendation context，支援 GPT 解釋層讀取最新 batch。

## 0.17.0
- LINE `report / 最新報告 / 本週報告` 現在回傳最新 cycle + review operator report，不再只讀舊的 `twse_daily_summary`。
- `ai 報告` payload 新增 cycle / review batch / review items / recommendation context，讓 GPT narration 能解釋最新狀態而不是停留在上週摘要。

## 0.16.1
- recommendation-review-save now respects review-side fill fallback when SIM_FILL_POLICY=RANGE_OR_CLOSE, promoting eligible D0 range misses into executed review samples for scoreboard accumulation.

## 0.16.0
- 新增 `SIM_FILL_POLICY`，支援 `STRICT_RANGE`、`RANGE_OR_CLOSE`、`NEXT_OPEN`。
- 預設改為 `RANGE_OR_CLOSE`：若買賣區間未觸發，模擬成交可回退到當日 close，開始累積第一批 executed samples。
- `src/index.ts` 的 pending order execution 會在 fallback fill 時把 `fallback=` 模式寫入 `mo_orders.reason`。

## 0.15.1
- 新增 execution gate breakdown，將 signal-generated-but-not-filled 細分為可診斷的 execution:* 原因。
- recommendation-review-save 會把 mo_orders.reason 正規化寫入 review_note，便於 scoreboard 追蹤成交阻塞根因。

## 0.14.9
- `recommendation-scoreboard` now distinguishes natural future-day waiting from broken data pipelines.
- Add `coverage_accumulation_summary` so MO can show the latest unlocked checkpoint, the next checkpoint to unlock, and how many future trade dates are still needed.
- Reclassify pure `not-enough-trade-days` situations away from `DATA_REPAIR`, reducing false alarms once D0 data is already valid.

## 0.14.8
- Hotfix `recommendation-review-save`: restore missing `canonicalTwSymbol` / `bareTwSymbol` / `unique` helpers so the command can execute instead of crashing with `ReferenceError`.
- Unblocks canonical `.TW` review persistence and allows the next successful save run to delete historical bare-symbol rows for the same trade date.

## 0.14.6
- Add TW close snapshot upsert into `prices_daily` during daily processing for active-universe symbols.
- Canonicalize recommendation persistence to `.TW` and delete legacy bare-symbol `mo_orders` / review rows for the same trade date.
- Recommendation review now counts unique future trade dates and falls back to `prices_daily` closes instead of relying only on duplicated `twse_daily_raw` rows.

## 0.14.4
- Add daily cycle state tracking (`mo_cycle_state`) so MO can keep retrying from 14:30 until next-day open instead of stalling at report-not-ready.
- Decouple recommendation/simulation bootstrap from report push; snapshot-ready days can now seed next-day simulated orders even when summary push is still pending.
- Add GPT explanation commands (`ai 狀態`, `ai 報告`, `ai 建議`) and include cycle state in AI payloads.

## 0.14.2
- Added weekly operator message layer for report payload shaping and publish-ready messaging.

## 0.14.0
- Added weekly run gating summary to recommendation-scoreboard.

## 0.13.9 operator final decision summary
- Add final operator decision summary / findings / actions to `mo recommendation-scoreboard`.
- Surface `final_decision`, `operator_priority`, `release_blocker`, `dominant_gate`, and `immediate_next_action`.

## 0.13.8
- Add pipeline advancement criteria output to recommendation-scoreboard.
- Add pipeline advancement summary/actions for stage progression visibility.

## 0.13.7
- add full pipeline readiness summary layer to recommendation-scoreboard

## 0.13.6
- add strategy evaluation unlock layer to recommendation-scoreboard

## 0.13.2
- Added symbol repair status transitions and repair transition summary/action layers to recommendation-scoreboard.

## 0.13.0
- Add `repair_readiness_summary`, `repair_progress_findings`, and `repair_progress_actions` to recommendation scoreboard.
- Extend symbol-level repair outputs into blocker-clearance / post-repair readiness signals for strategy evaluation.

## 0.12.9
- Add symbol-level `data_coverage_map` and `repair_targets` to recommendation scoreboard.
- Prioritize repair targets by blocker severity, missing-close concentration, and data-related share.

0.12.8

## 0.12.7
- feat(scoreboard): 新增 data quality action layer，於 gate attribution 後輸出 `data_quality_summary`、`data_quality_findings`、`data_quality_actionables`。
- feat(scoreboard): 將 data_gap / data_coverage / data_quality 與 execution_gate 分開判讀，讓 scoreboard 直接指出資料缺口是否為主要阻塞。

## 0.12.6
- feat(scoreboard): recommendation-scoreboard 現在會查詢 `review_note`，修正 0.12.5 skip reason breakdown 因缺欄位導致全部落在 `unknown / other` 的問題。
- feat(scoreboard): 新增 structured skip reason normalization，將 checkpoint-prefixed marks 正規化成 `signal-generated-but-not-filled`、`not-enough-trade-days`、`missing-close` 等穩定 reason，並映射到 `execution_gate`、`data_coverage`、`data_gap` 等 family。

## 0.12.5
- feat(scoreboard): 新增 actionable recommendations layer，於 `top_findings` 後輸出可執行的下一步建議。
- feat(scoreboard): recommendation 會依 gate pressure、executed share、edge state、horizon signal 自動調整。

## 0.12.3
- feat(scoreboard): 新增 batch-level summary 與 top findings，彙總所有 checkpoint 的 dominant status / gate pressure / edge state / horizon signal 共識。
- feat(scoreboard): 新增 strongest horizon、max execution coverage gap、average executed share 等批次層級摘要。

## 0.12.2
- feat(scoreboard): 新增 checkpoint diagnosis layer，於每個 checkpoint 額外輸出 `dominant_status`、`dominant_status_share`、`gate_pressure`、`edge_state`、`horizon_signal_strength`、`execution_coverage_gap`、`interpretation`。
- docs(scoreboard): 同步更新 MO_START / PROJECT / AI_MEMORY / NEXT_TASK / commands / developer guide，將 0.12.2 定位為 diagnosis 版本。

## 0.12.1
- feat(scoreboard): 新增 execution-aware performance summary，於每個 checkpoint 額外輸出 overall / executed / skipped / pending 的 evaluable share、average return、positive / win / loss / flat rate、expectancy、decisive rate。
- docs(baseline): 同步更新 MO_START / PROJECT / NEXT_TASK / commands / developer guide，將 0.12.1 定位為 execution-aware summary 版本。

## 0.12.0 - Recommendation Performance Engine
- `mo recommendation-scoreboard` 新增 checkpoint performance 指標：`expectancy`、`avg_win_return`、`avg_loss_return`、`edge_ratio`、`nonflat_evaluable`、`decisive_rate`。
- `mo recommendation-scoreboard` 新增 `last_1_batch` / `last_3_batch` / `last_5_batch` rolling summary。
- 新增 `BASELINE.json`、`mo baseline`、`scripts/write-baseline.mjs`，release 現在會自動鎖定 baseline manifest。

## 0.11.9 - Recommendation Outcome Classification
- `mo recommendation-scoreboard` 新增各 checkpoint 的 outcome classification。
- 新增 `win / loss / flat` 統計與 `win_rate / loss_rate / flat_rate`。
- 新增 `executed / skipped / pending` 切片的 evaluable 與 average_return，避免全部 `+0.00%` 時誤讀為真實績效無波動。
- 保留既有 summary 與 0.11.8 outcome metrics 欄位不變。

## 0.11.8 recommendation outcome metrics

- Extend `mo recommendation-scoreboard` with checkpoint outcome summary for D0 / D5 / D10 / D20.
- Added per-checkpoint `evaluable`, `coverage`, `positive`, `positive_rate`, and `average_return` metrics.
- Kept the existing total batch / symbol / filled / skipped / pending / latest batch summary unchanged.

## 0.11.7 recommendation scoreboard query normalization

- Fix recommendation-scoreboard on Windows by normalizing SQL before `wrangler d1 execute --command`.
- Guard against empty SQL in recommendation review library.

## 0.11.6 recommendation scoreboard
- 新增 `mo recommendation-scoreboard`，可彙總已落表的 recommendation review batch / item 統計。
- 輸出包含 total_batches、total_symbols、filled/skipped/pending orders、skip_ratio、filled_ratio，以及 latest batch 概況。

## 0.11.5
- 修正 `recommendation-review-save` 在 Windows / cmd 環境下以 `--command` 傳多行 SQL 造成 Wrangler 判定缺少 `--command` 的問題。
- `execSql()` 現在會先將 SQL 正規化為單行再送給 `wrangler d1 execute`。

## 0.11.3
- 新增 `mo recommendation-review-save`，把最新推薦批次 review 結果落表到 D1。
- 自動建立 `mo_recommendation_review_batches`、`mo_recommendation_review_items`。
- 為後續 scoreboard / 命中率統計建立正式 snapshot 基線。

## 0.11.3
- `mo recommendation-review` 輸出強化：新增 `max_review_horizon`、`available_checkpoints`、`pending_checkpoints`，並明確區分 `not-enough-trade-days`、`missing-close`、`signal-generated-but-not-filled`。

# Changelog

## 0.11.1
- feat(review): 新增 `scripts/recommendation-review.mjs` 與 `mo recommendation-review`，回看最新推薦批次在 D0 / D5 / D10 / D20 的模擬表現。
- docs(scope): 明確校正 MO 為推薦驗證系統，不將模擬資料層誤解為實盤交易系統。
- docs(tooling): 同步更新 `MO_START.md`、`docs/PROJECT.md`、`docs/AI_MEMORY.md`、`docs/NEXT_TASK.md`、`docs/BUGS.md`、`docs/FUTURE_SYSTEMS.md`、`docs/commands.md`、`developer/SCRIPTS_GUIDE.md`。


0.13.5: blocked repair completion criteria added.


- 0.14.2: added weekly_delivery_formatting_summary / weekly_delivery_formatting_blocks / weekly_delivery_formatting_actions for LINE/email/log payload shaping.


## 0.14.8
- add TW monthly close backfill inside recommendation review flow using official TWSE monthly close endpoint candidates
- auto upsert fetched .TW close rows into prices_daily before computing review horizons
- keep recommendation review/save async so remote repair can run before scoreboard evaluation

## 0.19.25
- fix: reference trade date now prefers the latest recommendation/signal date on or before the completed trading date
- fix: status summary/cycle labels now follow the unified reference trade date
