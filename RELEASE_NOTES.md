## 0.19.29
- 新增 `src/portfolio/position_sizing.ts`，把 recommendation 數量計算集中成單一 sizing engine。
- BUY 建議與 strategy debug 現在會附帶 sizing diagnostics：deploy ratio / target budget / weight / qty / notional。
- `/admin/status` 新增 `latestPendingExecDate`，LINE `狀態` / `報告` 也會顯示 pending 批次的預計模擬日，避免把週末誤認成可執行交易日。

建議驗證：
1. `npm run mo -- update`
2. `type VERSION`（應為 `0.19.29`）
3. `npm run mo -- doctor`
4. `npm run mo -- guard`
5. `npm run mo -- sanity`
6. `npm run mo -- deploy`
7. deploy 後驗證：
   - `/admin/status?token=...` 應顯示 `version=0.19.29` 與 `latestPendingExecDate=...`
   - LINE `狀態` / `報告` 若有 pending 訊號，應顯示 `預計模擬日 YYYY-MM-DD`
   - `建議` 文案中的 BUY 理由應包含 `Sizing：deploy ...` 等字樣

## 0.19.28
- 版號來源改為單一：`VERSION` -> `scripts/sync-runtime-version.mjs` -> `src/version.ts` -> Worker runtime。
- `src/index.ts` 不再保留手寫 `APP_VERSION`，避免 release 升版時遺漏。
- `mo guard` 會檢查 `src/version.ts` 與 `VERSION` 一致，並要求 runtime 透過 generated module 載入版號。

## 0.19.27
- 修正 src/index.ts 內 APP_VERSION 殘留舊值 0.19.12 的問題。
- release / guard / deploy 會自動同步 runtime 版本。
- Guard 會阻擋 APP_VERSION 與 VERSION 不一致的狀況。

## 0.19.26
- 新增 `src/review/runtime.ts`，把 review exact-match snapshot 查詢、projected horizon 計算、review 文案輸出集中到同一套 helper，避免 Worker 與 AI payload 各自長出不同規則。
- 新增 `/admin/review/status`，並擴充 `/admin/status` 的 review 對齊診斷欄位，可直接遠端確認目前 reference trade date 是否真的有 same-cycle saved review。
- 這版不刪資料庫中的舊 dev snapshot；仍維持「讀取時忽略舊 trade_date、必要時顯示 live projection」的策略。

建議驗證：
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.26`）
3. `npm run mo -- smoke`
4. `npm run mo -- smoke-worker`
5. `npm run mo -- guard`
6. `npm run mo -- sanity`
7. deploy 後驗證：
   - `/admin/status?token=...` 應新增 `reviewReferenceTradeDate` / `reviewExactSaved` / `reviewDisplayMode` 等欄位
   - `/admin/review/status?token=...` 若只有舊 snapshot，應顯示 `reviewExactSaved=none` 且 `reviewDisplayMode=live_projection`
   - LINE `報告` 內容應與 admin review 診斷一致，不應再把舊 snapshot 當成目前批次

## 0.19.25
- 修正 LINE `報告` 抓取 saved review 的規則：現在只接受 `trade_date = 當前 recommendation_trade_date` 的 snapshot，不再允許 `<=` 的舊批次混入，因此 `2026-03-06` 這種舊 review 不會再污染 `2026-03-13` 報告。
- 修正 review 逐檔明細與 AI payload 也同步套用相同 exact-match 規則，避免舊 cycle item 被誤讀成目前批次結果。
- 明確化 review lifecycle：若當前 recommendation_trade_date 尚未做 `review-save`，報告會顯示 `尚未建立 saved review`，並只保留 projected horizon。

建議驗證：
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- smoke`
4. `npm run mo -- smoke-worker`
5. `npm run mo -- guard`
6. `npm run mo -- sanity`
7. deploy 後在 LINE 驗證 `報告`：舊的 `2026-03-06` saved review 不應再出現；若尚未跑 `review-save`，應顯示 `尚未建立 saved review`。

## 0.19.25
- 收斂 LINE `報告` 的 review 區塊文案，改為清楚分開：目前可觀察進度 / 最新 saved review / projected horizon / 是否需要再跑 `review-save`。
- 新增 `docs/review_validation_architecture.md`，整理 review 整體目錄結構、程式責任分工、正式資料來源與禁止重複實作的規則。
- Worker 端新增集中式 review progress line formatter，避免之後調整文案時又在多處重複拼接相似內容。

建議驗證：
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- smoke`
4. `npm run mo -- smoke-worker`
5. `npm run mo -- guard`
6. `npm run mo -- sanity`
7. deploy 後在 LINE 驗證 `報告`：
   - review 區塊應分開顯示「目前可觀察進度」與「最新 saved review」
   - 若 saved review 落後，應另外顯示 projected horizon，而不是混在補充句裡
   - 逐檔明細仍只在 saved review 與當前 trade date 對齊時顯示

## 0.19.25
- 修正 LINE `報告` 的 review 進度顯示，避免 `summary/recommendation` 已到新 trade date，但 review 卻仍顯示舊批次日期。
- Worker 端現在可直接用最新市場日期自動推估 review horizon，並明確標示逐檔明細仍需後續 `review-save` 刷新。
- `mo_recommendation_review_batches` 的最新批次選取改為優先依 `trade_date`，避免舊批次重跑覆蓋較新的操作脈絡。

驗證重點
1. LINE `報告` 在非交易日沿用最新 trade date 時，review 區塊不應再卡在更舊日期。
2. 若目前只有舊 review snapshot，但市場資料已可推進到更高 horizon，畫面應顯示 auto-projected review progress。
3. 逐檔 review 明細只有在該 trade date 已做 `review-save` 時才顯示，避免誤把 projection 當成正式落表結果。

## 0.19.25
- 修正 `push-only` 僅在真正完成 LINE 推播後才寫入 `push_only_done=1`，避免 16:00 第一輪尚未有摘要時就被誤判成已推播、後續不再重試。
- `adminPushOnly()` 新增 duplicate push guard，手動 `/admin/run?push=1` 或 tick 重入都會避免同一交易日重複推播。
- `狀態` / `報告` 的 timing hint 會優先學習近期 `summary=Y` 與 `rec=Y` 的 tick 里程碑，再 fallback 到較粗略的 `cycle=done` 平均值。

建議驗證：
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- smoke`
4. `npm run mo -- smoke-worker`
5. `npm run mo -- guard`
6. `npm run mo -- sanity`
7. deploy 後驗證：
   - LINE `狀態` / `報告` 應正常顯示 timing hint
   - 週五若 16:00 尚未有摘要，之後摘要補齊時 push-only 仍可於後續 tick 正常推送一次
   - 同一交易日重複呼叫 `/admin/run?push=1` 應回 `reason=already_pushed` 或只成功推一次

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
- 修正 LINE `狀態` / `報告` 可能出現的 `buildMarketTimingHint is not defined` runtime error。
- 修正非交易日仍可能執行 `push-only` 並推送 `台股盤後總結` 的問題；週六、週日現在會直接跳過。
- `狀態` / `報告` 會顯示盤後資料常見時段、分析/推薦預估時段，以及目前是否仍在正常等待視窗內。

建議驗證：
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- smoke`
4. `npm run mo -- guard`
5. `npm run mo -- sanity`
6. deploy 後在 LINE 驗證：
   - `狀態`：應正常回覆，不再出現 `buildMarketTimingHint is not defined`
   - `報告`：應正常回覆最新資料截至日與 timing hint
7. 週末或模擬週末時確認 log / `/admin/tick` 不再出現 `push_only done` 對應到新的 `台股盤後總結（週六/週日）` 推播

## 0.19.25
- post-close timing guidance and learned analysis expectation window

## 0.19.25
- add exit sandbox preview for pretesting position/exit logic
- bump runtime and package version

## 0.19.25
- Added LINE 持倉 / portfolio command and polished command set.

## 0.19.25
- CLI 指令改為不區分大小寫。
- LINE 指令統一為狀態 / 報告 / 建議 / help，並改為不區分大小寫與多餘空白。
- LINE 報告與建議文案改為以資料截至日顯示，避免週末/隔日混淆。

## 0.19.25
- LINE 驗證重點：輸入「狀態」「最新報告」「建議」即可看到最新批次 pending/executed/skipped 與策略池現金/持倉。
- 這版主修 LINE 可讀性，不變更交易核心流程。

## 0.19.25
- 新增週末 sandbox 驗證兩條 admin 入口：`/admin/simulation/commit`、`/admin/simulation/reset`。
- `commit` 會把最新 `PENDING` signal batch 以 synthetic touch rows 正式寫入測試成交、持倉、現金與 execution mark。
- `reset` 會把 sandbox commit 前的 portfolio / positions / order 狀態完整還原，避免污染週一正式首跑。

建議驗證：
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. deploy 後依序驗：
   - `/admin/version?token=...` 應回 `market-observer version=0.19.25`
   - `/admin/status?token=...` 應回 `market-observer status version=0.19.25`，且尚未 commit 時 `sandboxSnapshot=none`
   - `/admin/simulation/preview?token=...` 先看預演
   - `/admin/simulation/commit?token=...` 應產生 commitEvents 與 audit
   - `/admin/status?token=...` 之後應顯示 `sandboxSnapshot=signalDate:... active:Y` 並看到 executed 變化
   - `/admin/simulation/reset?token=...` 應還原為 pending/未持倉/原現金
   - `/admin/status?token=...` 最後應回到 `sandboxSnapshot=none`

## 0.19.25

本版重點：修正 runtime 版號顯示、補上 execution audit、並強化 `/admin/status` 的 signal batch 狀態可讀性。

部署後驗證：
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- deploy`
4. 驗證以下端點：
   - `/admin/version?token=...` 應回 `market-observer version=0.19.25`
   - `/admin/status?token=...` 應回 `market-observer status version=0.19.25`，並帶出 `latestSignal=... total/pending/executed/skipped`
   - `/admin/simulation/preview?token=...` 應回 `simulation preview version=0.19.25`
   - `/admin/execution/audit?token=...` 應回 `execution audit version=0.19.25`，可直接比對 preview vs actual

注意：
- `/admin/simulation/preview` 仍是 dry-run，不會改變 `mo_orders / mo_positions / mo_execution_mark`。
- `/admin/execution/audit` 目前是以最新 signal batch 為主做 preview vs actual 對照，方便週一首跑後快速判讀。

## 0.19.25
- 新增 `/admin/status`：可直接看 remote 目前版本、最新 cycle、今日 tick、最新 pending / executed、portfolio 現況，以及最新模擬預演摘要，不必再從整份 log 反推系統有沒有真的跑完。
- 新增 `/admin/simulation/preview`：會以最新 `PENDING` 推薦批次自動建立「觸價成交」的合成價格，做一次 **不寫回 D1 的 dry-run**，直接回傳預計成交事件、現金變化、持倉結果。
- 本版刻意維持 **preview 不落表、不改單、不動持倉**，讓你可以在週末先驗證模擬交易邏輯，週一正式首跑前不需要再做 reset。

### 驗證順序
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- guard`
4. `npm run mo -- sanity`
5. `npm run mo -- validate`
6. `npm run mo -- deploy`
7. 開啟 `/admin/status?token=...`
8. 開啟 `/admin/simulation/preview?token=...`
9. 需要正式重跑時，再開啟 `/admin/run?token=...&force=1`

### 預期結果
- `/admin/status` 應回 `market-observer status version=0.19.25`，並帶出 latest cycle / pending / executed / tick 狀態。
- `/admin/simulation/preview` 應回 `simulation preview version=0.19.25`，且不會改變既有 `mo_orders / mo_positions / mo_execution_mark`。
- 週末可先用 preview 驗證「若下一交易日觸價，預計會怎麼成交」，等週一正式市場資料到位後再由正常 pipeline 進行第一次真模擬。

## 0.19.25
- 修正 report validator：只要 summary / snapshot / index 對齊同一個 `tradeDate`，且該交易日不是落後於「最新已完成交易日」，就視為 `reportStatus=VALID`；不再把「來源已齊但日期剛好是最新可用日」誤判成 `SOURCE_DELAY`。
- 修正 cycle 顯示：`getLatestOpenCycle()` 改成讀取最新的 open cycle，不再被較舊 cycle 的 `deadline / note` 壓回去。
- 新增版本檢查：加入 `/admin/version`，且 `/admin/run` 會直接回 `version=0.19.25`，方便確認 remote runtime 是否真的已部署到新版本。
- 補齊 baseline 結構：重新帶入 `.updates/README.md` 與必要 `.updates/*` 目錄，避免 doctor / release baseline 結構漂移。

### 驗證順序
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- guard`
4. `npm run mo -- sanity`
5. deploy 後執行 `/admin/version`
6. deploy 後執行 `/admin/run?force=1`
7. LINE 輸入 `最新報告`

### 預期結果
- `/admin/version` 應回 `market-observer version=0.19.25`。
- `/admin/run?force=1` 應回 `version=0.19.25`，且在 `tradeDate=2026-03-13` 這類最新已完成交易日資料已齊時，不再出現 `reason=latest_trade_date=2026-03-13`。
- LINE `最新報告` 第一行應顯示 `🧭 Market Operator Report｜資料截至 2026-03-13`，且狀態區塊不應再被舊 cycle 的 `2026-03-09T09:00:00+08:00 / waiting_recommendation` 綁住。
## 0.19.25
- 修正 report validator：當 `tradeDate` 已等於最新已完成交易日，且 summary / snapshot / index 對齊時，`reportStatus` 會回到 `VALID`，不再誤判為 `SOURCE_DELAY`。
- 支援非交易日 / 週末判讀：若最新已完成交易日資料已齊，`/admin/run` 仍應顯示 `reportStatus=VALID`。
- 修正 LINE operator report header：當報告不是今天盤後資料時，標題會明確顯示 `資料截至 YYYY-MM-DD`。
- 修正 review horizon 顯示：若最新 saved review 尚未刷新，LINE 仍會依最新可用交易日自動推進 horizon，避免長期停在舊 checkpoint。
- 補回 `.updates/README.md`，讓 baseline 包重新通過 `mo doctor`。

### 驗證順序
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.19.25`）
3. `npm run mo -- guard`
4. `npm run mo -- sanity`
5. deploy 後執行 `/admin/run?force=1`

### 預期結果
- `/admin/run?force=1` 在最新已完成交易日資料已齊時，應看到 `reportStatus=VALID`，而不是 `SOURCE_DELAY`。
- LINE `最新報告` 第一行在非當日盤後情境下，應顯示 `🧭 Market Operator Report｜資料截至 YYYY-MM-DD`。
- 若 saved review 尚未更新但市場已多出新交易日，LINE `最新報告` 的驗證進度應顯示自動推進後的 `D` horizon，並提示需要 `review-save` 才會刷新逐檔明細。

## 0.19.25
- Added REPORT_GATE / PUSH_GATE / RECOMMENDATION_GATE so incomplete reports no longer push LINE or emit actionable recommendations.
- Removed the fixed one-line market commentary from the generated summary.
- `/admin/run` now reports `reportStatus`, `recStatus`, and `execDate` based on final gate outcomes.

## 0.18.0

- FinMind trade-date backstop 改為使用 `TaiwanStockTradingDate`，不再用免費等級會 400 的 `TaiwanStockPrice` 全市場查詢。
- TWSE legacy probe 改為優先探測 `anchor+1, anchor, anchor-1, anchor-2`，補上最重要的次一交易日（例如 3/10），不再直接先查 today。
- 若 legacy / FinMind 候選日期超過 anchor + 1 天，會直接忽略，不再讓單一來源把 tradeDate 拉到 +2 天造成 ABORT。

## 0.17.9

- 新增 FinMind trade-date backstop（需先設定 FINMIND_TOKEN）。
- TWSE legacy probe 改成含 today / today-1 / anchor，讓 3/11 凌晨可補抓 3/10。
- 修正 最新報告 日期選擇，避免舊 review batch 壓過最新 cycle。

## 0.17.8
- 修正 TWSE legacy MI_INDEX 補查不再直接從今天往回亂探；改為以主來源最新日期為 anchor，只允許接受最多 +1 天的補強結果。
- `/admin/run?force=1` log 會額外顯示 legacy probe anchor / probes / delta，方便判讀為何採用或忽略舊版查詢結果。

驗證重點
1. deploy 後執行 `/admin/run?force=1`，應看到 `legacy probe anchor=`。
2. 若 OpenAPI/FMTQIK/STOCK_DAY_ALL 共識為 2026-03-09，legacy 不應再直接跳到 2026-03-11。
3. 若 legacy 取得 2026-03-10，log 應顯示 `tradeDate advanced by legacy backstop`。

## 0.17.7
- TWSE trade-date resolver now reads the latest date span from FMTQIK and STOCK_DAY_ALL, and also probes legacy MI_INDEX date-query endpoints when OpenAPI freshness lags.
- `mo pack` / `mo release` / `mo pack-patch` now auto-include root repo files, so newly added files such as baseline/config/docs are less likely to be missed from artifacts.
- Verify after deploy with `/admin/run?force=1` and confirm logs show `FMTQIK date span first=... last=...` plus `candidate tradeDate=... via MI_INDEX_LEGACY(...)` when needed.

## 0.17.6

- 預設 AI 模型固定為 `gpt-4o-mini`，避免未設定時落到 `gpt-5-mini`。
- `wrangler.jsonc` 新增 `AI_ENABLED=1`、`OPENAI_MODEL=gpt-4o-mini` 預設 vars。
- 新增 `mo_ai_audit`：會記錄最近一次 AI 呼叫的 kind / model / enabled / ok / status_code / duration_ms / response_chars / error / request_id。
- Cloudflare log 現在可看到 `[AI] call start`、`[AI] call ok`、`[AI] call fail`，方便確認 GPT API 是否真的有被調用且有無回應。

### 驗證
1. `npm run mo -- doctor`
2. `npm run mo -- guard`
3. `npm run mo -- sanity`
4. deploy 後在 LINE 輸入 `ai 狀態` / `ai 報告`
5. Cloudflare Logs 應看到 `model=gpt-4o-mini` 與 `call ok` 或 `call fail`

## 0.17.3

- `report / 最新報告 / 本週報告` 現在優先回傳可直接閱讀的 operator narration：會先講結論、目前狀態、驗證進度、系統判讀、重點標的、下一步。
- `ai 報告 / ai 狀態 / ai 建議` 現在有雙層 timeout guard：webhook reply 最晚 2.5 秒內一定 fallback；OpenAI 呼叫 2.2 秒內若未完成會中止並改回內建摘要。
- 支援 `AI報告 / AI狀態 / AI建議`、`GPT報告 / GPT狀態 / GPT建議` 這類無空白輸入。

### 驗證順序
1. `npm run mo -- doctor`
2. `type VERSION`（應為 `0.17.3`）
3. `npm run mo -- deploy`

### LINE 驗證
- `最新報告`：第一行應為 `🧭 Market Operator Report｜<tradeDate>`，且主體不再出現 `summary=Y/N`、`rec=Y/N` 這類工程欄位。
- `AI 報告` 或 `AI報告`：即使 OpenAI 慢回，也應在數秒內至少收到 fallback 內建摘要。
- `AI 狀態` / `AI 建議`：同樣不可再出現 webhook 無回覆。

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

- 新增 execution gate 診斷摘要與 top reasons。
- review_note 新增 execution:* 細分原因，支援 scoreboard 追蹤成交阻塞。

## 0.14.9
- Add `coverage_accumulation_summary` to `mo recommendation-scoreboard` so the CLI shows whether MO is waiting for future trade dates or still repairing broken data.
- Pure `not-enough-trade-days` states now map to `coverage_wait / COVERAGE_ACCUMULATION` instead of being treated like missing-close repair failures.
- Verification: `npm run mo -- doctor` -> `npm run mo -- guard` -> `npm run mo -- sanity` -> `npm run mo -- recommendation-review-save` -> `npm run mo -- recommendation-scoreboard`.

## 0.14.8
- Hotfix for 0.14.6: `npm run mo -- recommendation-review-save` no longer crashes on missing helper definitions.
- After update, rerun `npm run mo -- recommendation-review-save` once to rewrite the latest review rows in canonical `.TW` form and clear same-date bare-symbol duplicates.
- Verification: `npm run mo -- doctor` -> `npm run mo -- guard` -> `npm run mo -- sanity` -> `npm run mo -- recommendation-review-save` -> `npm run mo -- recommendation-scoreboard`.

## 0.14.6
- Fix TW canonical symbol persistence across `mo_orders` and review-save so new review rows are saved as `XXXX.TW`.
- `runDailyProcess()` now upserts TW close snapshots into `prices_daily` for the active universe, reducing future `missing-close` gaps.
- `recommendation-review-save` now deduplicates raw dates, prefers `prices_daily` closes, and deletes legacy bare-symbol review rows before saving canonical rows.
- Verification: `npm run mo -- doctor` -> `npm run mo -- guard` -> `npm run mo -- sanity` -> `npm run mo -- recommendation-review-save` -> `npm run mo -- recommendation-scoreboard`.

## 0.14.4
- Add Daily Cycle Engine foundation: `mo_cycle_state` tracks `waiting_data / report_ready / core_ready / actionable_ready / report_only / expired`.
- Tick retry window extends to next-day open (09:00 Asia/Taipei) so MO keeps checking for late data instead of stopping at evening report time.
- Recommendation/simulation seeding no longer depends on report push success; 20-trading-day validation can start as soon as structured recommendation data exists.
- LINE adds `ai 狀態` / `ai 報告` / `ai 建議` for GPT explanation layer based on structured MO payloads.
- Verify order: `npm run mo -- doctor` -> `npm run typecheck` -> deploy -> LINE `狀態` / `ai 狀態` / `建議`.

## 0.14.2
- Added weekly operator message layer for report payload shaping and publish-ready messaging.

# 0.14.0

- Added weekly_run_gating_summary / findings / actions to recommendation-scoreboard.
- Added weekly report vs simulation gating based on operator decision.

## 0.13.9
- Add `operator_final_decision_summary`, `operator_final_decision_findings`, and `operator_final_decision_actions` to `mo recommendation-scoreboard`.
- Collapse the full repair->unlock pipeline into a final operator decision view for immediate next action.

# Release Notes

## 0.13.8
- Added pipeline advancement criteria layer to recommendation-scoreboard.
- Added pipeline_advancement_summary and pipeline_advancement_actions.


## 0.13.7
- add pipeline_readiness_summary / pipeline_readiness_findings / pipeline_readiness_actions
- summarize repair, warning, recheck, promotion, and unlock state into one top-level pipeline view

## 0.13.6
- add strategy evaluation unlock layer to recommendation-scoreboard
- add symbol_strategy_evaluation_unlock / strategy_evaluation_unlock_summary / strategy_evaluation_unlock_actions

## 0.13.5
- add post-repair recheck outcome layer to recommendation-scoreboard
- add symbol_post_repair_recheck_outcomes / post_repair_recheck_summary / post_repair_recheck_actions

0.13.5
0.13.2
- Added symbol_repair_status_transitions, repair_transition_summary, and repair_transition_actions.

## 0.13.0
- Repair Progress / Blocker Clearance
- `mo recommendation-scoreboard` 新增 `repair_readiness_summary`、`repair_progress_findings`、`repair_progress_actions`。
- 會在 `data_coverage_map` / `repair_targets` 之後，直接判斷 blocker 是否仍未解除，以及修復後是否已可進入 `STRATEGY_EVALUATION`。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後確認已出現 `repair_readiness_summary:`、`repair_progress_findings:`、`repair_progress_actions:`。

0.12.9

## 0.12.9
- Data Coverage Map / Repair Targets
- `mo recommendation-scoreboard` 新增 `data_coverage_map` 與 `repair_targets`。
- 會依 symbol 彙總 skip reason、data-related share、主要 issue、主要 checkpoint 與 blocker severity，直接指出優先修資料的標的。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後確認已出現 `data_coverage_map:` 與 `repair_targets:`。

0.12.8

## 0.12.7
- Data Quality Action Layer
- `mo recommendation-scoreboard` 在 `skip_reason_breakdown / gate_attribution / top_skip_reasons / gate_actionables` 之後，新增 `data_quality_summary`、`data_quality_findings`、`data_quality_actionables`。
- 會直接判讀資料缺口是否主導 skip，例如 `missing-close`、`not-enough-trade-days` 是否比 execution gate 更需要優先修復。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後確認已出現 data quality 三個新區塊。

## 0.12.6
- Structured Skip Reason Normalization
- `mo recommendation-scoreboard` 修正會一併查詢 `review_note`，不再把 skipped rows 全部誤歸為 `unknown`。
- 新增 structured normalization：把 `D20:not-enough-trade-days`、`D5:missing-close`、`signal-generated-but-not-filled` 等標記正規化成穩定 skip reason。
- `skip_reason_breakdown` / `gate_attribution` / `top_skip_reasons` 會優先輸出 normalization 後的 reason 與 gate family，例如 `data_coverage`、`data_gap`、`execution_gate`。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後確認不再只看到 `unknown / other`。

## 0.12.5
- Actionable Recommendations Layer
- `mo recommendation-scoreboard` 在 `batch_level_summary` / `top_findings` 之後，新增 `actionable_recommendations` 區塊。
- 依據 gate pressure、executed share、edge state、horizon signal，自動輸出下一步建議，例如先補 executed samples、先查 skip gate、暫緩 horizon 最適化。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後檢查 `actionable_recommendations:` 是否有正常輸出。

## 0.12.3
- Batch-Level Summary / Top Findings
- `mo recommendation-scoreboard` 在各 checkpoint diagnosis 之後，新增 `batch_level_summary` 與 `top_findings` 區塊。
- `batch_level_summary` 會輸出 `dominant_status_consensus`、`gate_pressure_consensus`、`edge_state_consensus`、`horizon_signal_consensus`、`strongest_horizon_checkpoint`、`max_execution_coverage_gap`、`average_positive_rate`、`average_executed_share`。
- `top_findings` 會直接列出本批次最重要的觀察，讓 scoreboard 從可讀提升到可快速判讀。

## 0.12.2
- Recommendation Diagnosis Layer
- `mo recommendation-scoreboard` 在既有 outcome / classification / performance / rolling / execution_summary 之外，新增 `D0 / D5 / D10 / D20` 的 `diagnosis` 區塊。
- 每個 checkpoint 會額外輸出 `dominant_status`、`dominant_status_share`、`gate_pressure`、`edge_state`、`horizon_signal_strength`、`execution_coverage_gap`、`interpretation`。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後檢查各 checkpoint 的 `*_diagnosis`。

## 0.12.1
- Execution-Aware Performance Summary
- `mo recommendation-scoreboard` 在既有 outcome / classification / performance / rolling 之外，新增 `D0 / D5 / D10 / D20` 的 `execution_summary` 區塊。
- 每個 checkpoint 會額外輸出 `overall / executed / skipped / pending` 的：`evaluable`、`share_of_evaluable`、`average_return`、`positive_rate`、`win_rate`、`loss_rate`、`flat_rate`、`expectancy`、`decisive_rate`。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後檢查各 checkpoint 的 `*_execution_summary`。

## 0.12.0
- Recommendation Performance Engine
- `mo recommendation-scoreboard` 新增 checkpoint performance 指標：`expectancy`、`avg_win_return`、`avg_loss_return`、`edge_ratio`、`nonflat_evaluable`、`decisive_rate`。
- 新增 rolling 視角：`last_1_batch` / `last_3_batch` / `last_5_batch` 的 evaluable、average_return、positive_rate。
- 新增 `BASELINE.json` 與 `mo baseline`；release 會自動寫入 locked baseline manifest。
- 驗證順序：先 `npm run mo -- doctor`，再 `npm run mo -- recommendation-scoreboard`，最後 `npm run mo -- baseline`。

Recommendation Outcome Classification

## 0.11.9

本版擴充 `mo recommendation-scoreboard`，在既有 D0 / D5 / D10 / D20 outcome metrics 之外，新增 outcome classification 區塊：
- `win / loss / flat`
- `win_rate / loss_rate / flat_rate`
- `executed / skipped / pending` 的 `evaluable` 與 `average_return`

用途：讓 scoreboard 在目前樣本多為 skipped 或回報為 `+0.00%` 時，能更清楚區分是「真的 flat」還是「不同 execution status 的混合結果」。

建議驗證：
1. `npm run mo -- doctor`
2. `npm run mo -- recommendation-scoreboard`

預期：
- 舊的 summary 欄位與 D0 / D5 / D10 / D20 outcome metrics 仍存在
- 每個 checkpoint 下面新增 classification 區塊
- 會顯示 `win / loss / flat` 與 `executed / skipped / pending` 切片

## 0.11.8
- Extend `mo recommendation-scoreboard` with checkpoint outcome summary for D0 / D5 / D10 / D20.
- New outcome metrics: `evaluable`, `coverage`, `positive`, `positive_rate`, `average_return`.
- Existing scoreboard summary fields remain unchanged for backward compatibility.

# 0.11.7

- Fix `mo recommendation-scoreboard` so remote D1 queries normalize SQL before passing to Wrangler on Windows.
- Add empty-SQL guard in recommendation review query helper.

# 0.11.6
- Added `mo recommendation-scoreboard` to summarize saved recommendation review snapshots.
- Updated CLI/help/doctor/docs for the new verification command.

## 0.11.5
- 修正 `recommendation-review-save` 在 Windows / cmd 環境下以 `--command` 傳多行 SQL 造成 Wrangler 判定缺少 `--command` 的問題。
- `execSql()` 現在會先將 SQL 正規化為單行再送給 `wrangler d1 execute`。

## 0.11.3
- 新增 `mo recommendation-review-save`，把最新推薦批次 review 結果落表到 D1。
- 自動建立 `mo_recommendation_review_batches`、`mo_recommendation_review_items`。
- 為後續 scoreboard / 命中率統計建立正式 snapshot 基線。

## 0.11.3
- `mo recommendation-review` 輸出強化：新增 `max_review_horizon`、`available_checkpoints`、`pending_checkpoints`，並明確區分 `not-enough-trade-days`、`missing-close`、`signal-generated-but-not-filled`。

# Release Notes

## 0.11.1
- 新增 `mo recommendation-review`，用最新推薦批次回看 D0 / D5 / D10 / D20 的模擬表現。
- 明確校正 MO 定位：MO 是推薦驗證系統，不是實盤交易系統；portfolio / orders / execution marks 屬於推薦驗證用模擬資料層。
- 同步更新 `MO_START.md`、`docs/PROJECT.md`、`docs/AI_MEMORY.md`、`docs/NEXT_TASK.md`、`docs/BUGS.md`、`docs/FUTURE_SYSTEMS.md`、`docs/commands.md`、`developer/SCRIPTS_GUIDE.md`。

## 驗證重點
1. `npm run mo -- doctor` 後，版本應顯示為 `market-observer@0.11.1`。
2. `npm run mo -- recommendation-review` 應成功，輸出最新推薦批次的 D0 / D5 / D10 / D20 表現。
3. 若目前尚不足 20 個交易日資料，腳本應顯示 partial review / D20 summary skip，而不是失敗。



- 0.14.2: added weekly_delivery_formatting_summary / weekly_delivery_formatting_blocks / weekly_delivery_formatting_actions for LINE/email/log payload shaping.


## 0.14.8
- `mo recommendation-review` / `save` 會先嘗試補抓 active TW symbols 的月收盤資料，再計算 D0/D5/D10/D20
- 修正 review 流程為 async，避免 backfill 邏輯無法執行
- 目標：優先解除 `D0:missing-close`，讓後續缺口收斂到 `not-enough-trade-days`

## 0.19.25
- fix: reference trade date now prefers the latest recommendation/signal date on or before the completed trading date
- fix: status summary/cycle labels now follow the unified reference trade date
