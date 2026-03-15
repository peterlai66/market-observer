## Remote verification helper (0.19.26)
- `/admin/review/status` 用來檢查當前 `referenceTradeDate` 是否真的有 exact-match saved review。
- `/admin/status` 也會帶出相同 review 對齊摘要，方便不切換 endpoint 時快速觀察。
- 這兩者只做 observability，不改資料、不清理舊 rows。

# Review Validation Architecture

本文件是 MO「推薦驗證 / review」子系統的單一整理文件，用來收斂目前散落在 Worker、CLI、scoreboard、文件中的定義，避免之後繼續開發時重複造輪子。

## 1. 子系統定位

Review 子系統不是交易引擎，也不是新的策略來源。
它只負責回答三件事：

1. 某一個 `trade_date` 的推薦批次，現在最多能回看到哪個 checkpoint。
2. 各檔標的在 D0 / D5 / D10 / D20 的模擬結果是什麼。
3. 這些結果是否已正式落表，能否被 scoreboard 與 LINE 報告當成正式 snapshot 使用。

## 2. 單一責任分層

### A. `scripts/_recommendation_review_lib.mjs`
唯一的 review 計算核心。

負責：
- 解析 `wrangler.jsonc`
- 執行 D1 SQL 查詢
- 正規化台股 symbol（bare / `.TW`）
- 計算 D0 / D5 / D10 / D20 checkpoint
- 組出 review batch / item 結果
- 將 snapshot 寫入 `mo_recommendation_review_batches` / `mo_recommendation_review_items`

不負責：
- LINE 文案
- Worker operator report 排版
- scoreboard 診斷文案

### B. `scripts/recommendation-review.mjs`
CLI 只讀入口。

負責：
- 呼叫 `computeRecommendationReview()`
- 印出 review 結果

不負責：
- 任何寫入
- 任何額外商業邏輯

### C. `scripts/recommendation-review-save.mjs`
CLI 落表入口。

負責：
- 呼叫 `computeRecommendationReview()`
- 呼叫 `saveReviewSnapshot()`
- 寫入正式 review snapshot tables

不負責：
- scoreboard 聚合
- Worker 報告排版

### D. `scripts/recommendation-scoreboard.mjs`
批次統計與診斷層。

負責：
- 讀取 review snapshot tables
- 彙總批次、checkpoint、status、diagnosis
- 輸出可供驗證與分析的統計結果

不負責：
- 回頭重新計算 review
- 修改 review snapshot

### E. `src/index.ts`
Worker operator / LINE 顯示層。

負責：
- 以 `referenceTradeDate` 為主軸組出 LINE `狀態 / 報告`
- 若 saved review 落後，允許用 live market dates 投影 horizon
- 明確區分「saved review」與「projected horizon」

不負責：
- 寫入 review snapshot
- 取代 `recommendation-review-save`

## 3. 目前正式資料契約

### Source of truth

#### 正式 review snapshot
- `mo_recommendation_review_batches`
- `mo_recommendation_review_items`

這兩張表是 scoreboard 與逐檔 detail 的正式資料來源。

#### live projection only
- `twse_daily_raw`
- `prices_daily`

這兩張表只能用來推估目前能走到哪個 horizon。
不能直接當成 item-level saved review 的替代品。

## 4. 名詞定義

### `trade_date`
推薦批次的基準日期，也是 review 驗證起點。

### `saved review`
已由 `recommendation-review-save` 寫入 D1 的正式 snapshot。

### `live projection`
Worker 根據市場已存在的交易日，自動推估目前理論上可觀察到的 horizon。
只用於 operator report，不代表逐檔明細已刷新。

### `max_review_horizon`
目前已可驗證到的最大 checkpoint，例：
- `0` = 到 D0
- `1` = 只多出 1 個後續交易日，尚不足 D5
- `5` = 到 D5
- `10` = 到 D10
- `20` = 到 D20

### `available_trade_dates`
從 `trade_date` 起算，目前市場資料中可用的交易日數量。

### `available_checkpoints`
已經可以正式判讀的 checkpoint 集合，例如 `D0, D5`。

### `pending_checkpoints`
尚未累積完成的 checkpoint 集合，例如 `D10, D20`。

## 5. Worker 顯示規則

Worker `報告` 的 review 區塊固定分三層：

1. 目前可觀察進度
2. 最新 saved review
3. 若 saved review 落後，另外顯示 projected horizon

也就是說，之後不應再出現把這三件事混成一句話的寫法。

### 正確示例
- 目前可觀察 2 個交易日，進度到 D1
- 最新 saved review：2026-03-06｜D0
- 目前顯示：依市場交易日自動推估至 2026-03-14｜D1
- 逐檔明細：仍以 saved review 為準；如需刷新逐檔結果，請再執行 review-save。

## 6. 之後開發時的禁止事項

### 不可再做的事
- 在 `src/index.ts` 重新實作一套 review checkpoint 計算規則
- 在 scoreboard 內偷偷補做 review-save 的責任
- 用 `twse_daily_summary` 或 `mo_cycle_state` 當 review source of truth
- 把 projected horizon 誤寫成 saved review
- 在多個文件重複定義 D0 / D5 / D10 / D20 的含義但內容不一致

### 可以做的事
- 讓 Worker 文案更清楚
- 增加 review-save 自動補齊流程
- 將 scoreboard 的診斷規則再模組化
- 將 checkpoint 常數進一步抽成 shared constant

## 7. 後續整理方向

下一輪若再整理 review 結構，優先順序固定如下：

1. 先維持 `_recommendation_review_lib.mjs` 作為唯一計算核心
2. 再把 checkpoint 常數與 label helper 抽到 shared review constant
3. 再整理 scoreboard 內部過長的 diagnosis / readiness 區塊
4. 最後才考慮把 Worker 的 review 顯示邏輯拆成獨立 helper module

## 8. 文件對齊要求

之後只要有以下任一變動，必須同步更新本文件：
- review table schema
- review/save/scoreboard 的責任分工
- Worker report 的 review 顯示規則
- `max_review_horizon` / `available_trade_dates` / `available_checkpoints` 的定義
