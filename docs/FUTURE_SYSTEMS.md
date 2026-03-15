## FS-02 Recommendation Scoreboard
- 基於 `mo_recommendation_review_batches` / `mo_recommendation_review_items` 產出批次 scoreboard。
- 指標包含：平均報酬、勝率、有效樣本數、checkpoint 覆蓋率。

# FUTURE_SYSTEMS

## Purpose
這份文件專門記錄 **尚未進入當前實作範圍，但已經定案要保留在 MO 藍圖中的後續系統**。

用途只有兩個：
1. 避免交接時遺漏「已討論、但尚未開發」的系統方向。
2. 讓 AI 接手時能分清楚：**哪些是現在要做的、哪些是下一階段要做的、哪些只是未來保留設計**。

---

## Current boundary
### 已在當前版本內
- CLI / update / smoke / deploy toolchain
- ETF universe（env → D1 → default）
- 多標的 recommendation
- pending → executed / skipped 基礎閉環
- 成本感知交易守門（minQty / minNotionalTwd / roundTripCost / edge_lt_cost）

### 尚未完整落地、但已明確列入後續系統
- 完整 portfolio closed loop
- realized / unrealized PnL 可視化
- 更完整的市場 regime 與風控分層
- GPT 解說 / 推播解釋層
- 更完整的 system health / audit / autopilot 類能力

---

## Future system backlog

### FS-01｜Portfolio Closed Loop v2
目標：把目前第一階段成交閉環，擴展成完整資產循環。

範圍：
- 持倉成本、部位變化、資金變化完整可追溯
- BUY / SELL / partial fill 對資金與均價的影響一致化
- 與 `daily_mark` / `mo_positions` / `mo_orders` 的資料口徑對齊

完成條件：
- 可穩定回答「今天為什麼資產變化」
- 可回推出每筆成交如何影響現金、持倉、市值、總資產

### FS-02｜PnL Visibility
目標：補齊已成交部位的損益可視化。

範圍：
- unrealized PnL（未實現損益）
- realized PnL（已實現損益）
- 持倉報酬、總報酬、成本拆解（手續費 / 稅 / 滑價）
- LINE / debug / 狀態查詢可直接讀到關鍵數值

完成條件：
- 使用者可直接看到每檔目前盈虧與整體累積損益
- 成本不再只存在成交當下，而是能持續反映在損益觀測

### FS-03｜Regime / Risk Layer v2
目標：把現有 recommendation signal 擴展成更明確的市場狀態與曝險控制層。

範圍：
- risk-on / neutral / risk-off / defensive 類 regime
- 不同 regime 下的現金比例、單檔上限、總曝險上限
- 成本守門與 regime 守門能共同作用，而不是互相覆蓋

完成條件：
- recommendation、position sizing、portfolio exposure 都能反映 regime
- debug 能解釋某筆單是被 signal 擋掉、成本擋掉，還是 regime 擋掉

### FS-04｜GPT Explanation Layer
目標：讓 MO 不只產出數值，還能輸出可追溯的白話說明。

範圍：
- 盤後摘要自然語言解釋
- recommendation 原因白話化
- LINE 對話式追問（用戶問「為什麼今天不買？」時可以回答）
- 必須建立在結構化資料上，不可讓 GPT 直接決定交易數值

完成條件：
- GPT 只負責解釋，不直接改動行情計算、成交模擬、風控邏輯
- 所有說明都能回指到結構化資料來源

### FS-05｜System Guard / Sanity / Autopilot
目標：建立比 smoke 更接近執行期的自動防呆層。

範圍：
- schema drift / required file / artifact 命名檢查
- 關鍵 runtime invariant 檢查（例如現金不應無故變負、持倉不應出現 NaN）
- 交付前 sanity check
- 後續 autopilot 類自動巡檢入口

完成條件：
- 能在 release 前先攔下明顯不一致或遺漏
- handoff 時可快速檢查「文件 / 程式 / 流程 / bug 清單」是否缺項

---

## Priority order
目前優先順序：
1. FS-01 Portfolio Closed Loop v2
2. FS-02 PnL Visibility
3. FS-05 System Guard / Sanity / Autopilot
4. FS-03 Regime / Risk Layer v2
5. FS-04 GPT Explanation Layer

---

## Handoff rule for this file
- 之後凡是聊天室中新增「未立即開發，但明確列為後續系統」的內容，必須同步更新這份文件。
- 若 handoff 包缺少本文件，視為交接資訊不完整，必須補齊。
- `MO_START.md` 指定的必讀文件清單，必須包含本文件。


## 0.10.2 progress note
- FS-05 已完成第一階段：`mo guard` / `mo sanity` 與 release 前 guardrail 流程。
- 尚未完成的部分是 runtime invariant / autopilot 巡檢。


## 0.10.4 progress note
- FS-05 第三階段已完成：`mo validate`、`mo preflight`、`mo preflight-worker`，並將 `autopilot` 收斂成相容別名。
- 尚未完成的部分仍是 runtime invariant 檢查與更完整的自動巡檢摘要。


## Guardrail follow-up after 0.10.8
- 任何直接讀取 `wrangler.jsonc` / `package.jsonc` / 類 JSONC 設定的腳本，都應共用同一套 JSONC tolerant parser，避免再次出現單一腳本自寫 `JSON.parse` 造成 preflight 失敗。

## Guardrail follow-up after 0.10.5
- 把 runtime invariants 擴充到 realized / unrealized PnL、snapshot history、position valuation，讓 FS-01 不只更新資料，也能自動驗證資料。


## Portfolio Closed Loop v2 notes
- 已新增 `mo portfolio-verify` 作為資料層驗收前哨。下一步是把 `EXECUTED -> mo_positions / cash_twd / snapshot` 的更新流程本身做成更強的閉環。


## 0.11.0 progress note
- 已新增 `mo recommendation-review` 作為推薦驗證入口。
- 後續若要進一步擴充，優先做 recommendation scoreboard / batch review，而不是把 MO 轉向真實交易系統。

- Guardrail 強化：release 交付前需證明版本已更新、目標腳本已實改，避免 AI 空口宣稱完成。


- Recommendation validation layer 後續應把 `recommendation-review` CLI 報表轉成可落表的 scoreboard 結構，供 20 交易日驗證批次化追蹤。

## 0.11.6 progress note
- FS-02 已有第一版 `mo recommendation-scoreboard`，目前先提供 batch / item 統計與最新批次摘要。
