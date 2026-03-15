## 0.14.4 cycle-aware GPT integration
- GPT explanation layer 已接到 cycle-aware payload，而不只讀純 report。
- 第一階段支援 `status / report / recommendation` 三種解釋模式，且會看到 cycle 狀態、deadline、actionable 與 recommendation readiness。
- GPT 仍只做解釋，不可覆寫 recommendation / simulation / risk 規則。

# GPT API 整合規劃（讓 MO 更有人性化）

> 目標：MO 是「智慧型市場觀察及投資決策專家」，**不做實際下單**。

## 1) API 選型

建議使用 **OpenAI Responses API**（取代 Assistants API / Chat Completions 作為 agent 工具編排）。
- Responses API：單次 request 內可進行多回合工具呼叫與輸出整理。\
- Assistants API：官方已公告 deprecated，預計 2026-08-26 關閉。 

參考（官方文件）：
- https://developers.openai.com/api/docs/guides/migrate-to-responses/
- https://developers.openai.com/api/docs/deprecations/

## 2) 先做「對話應答」的人性化（低風險、高體感）

### 2.1 LINE 問答模式（兩層）

- **Layer A：規則式（快速）**
  - `昨日報告` / `建議` 等指令仍走 DB 快取，不經 GPT。

- **Layer B：GPT 解釋層（可選）**
  - 當使用者輸入：
    - 「幫我解釋一下昨天為什麼這樣跌？」
    - 「這個建議我該注意什麼風險？」
  - Worker 取 D1 的結構化資料（摘要、指數、成交額 Top、建議清單），交給 GPT 生成人話。

### 2.2 建議輸出格式（固定骨架，避免幻覺）

- 先把數據整理成 JSON
- 要求 GPT：
  - 僅能用提供的數據
  - 不可捏造新聞
  - 不提供「保證獲利」語氣

## 3) 再做「市場偵測」的智慧化（中風險、需要 guardrails）

### 3.1 偵測 input（模型吃什麼）

- Index：open/high/low/close、change、pct
- Breadth：上漲/下跌/持平（若未齊，用 unknown）
- Volume leaders：成交額 Top N
- Regime features（你現有的 scoring / alpha）：trend、vol、drawdown、breadth

### 3.2 GPT 的工作

- 把「特徵 → 結論」寫成人話
- 給出「風險提示」與「你可以怎麼做」
- **永遠加註：模擬/不構成投資建議**

## 4) 工程落地建議（最小可行）

- 新增 `src/ai/` 模組：
  - `aiClient.ts`：呼叫 OpenAI Responses API
  - `prompt.ts`：固定 prompt 模板
  - `render.ts`：把 D1 結構化資料餵給模型

- 先用一個 feature flag：
  - `AI_ENABLED=0/1`
  - 沒開就完全不呼叫 API（避免成本與風險）

## 5) 安全與品質

- 只允許模型根據 D1 查到的資料回答（no web）
- 對輸出做最後檢查：
  - 禁止出現「保證獲利」「一定會漲」等語句
  - 禁止捏造新聞與事件

