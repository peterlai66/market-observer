# Architecture

> 定位：**智慧型市場觀察及投資決策專家（不做實際交易）**。
> 系統提供「觀察、摘要、建議、模擬驗證」，**不會送出真實券商下單**。

## Components

- **Cloudflare Worker**
  - HTTP: `/webhook`（LINE Bot）
  - HTTP: `/admin/run`（手動觸發一次日流程）
  - Cron: `*/15 * * * *`（tick dispatcher/心跳/去重鎖）
- **D1 (SQLite)**
  - 保存盤後摘要、策略建議（orders）、模擬成交結果與稽核
- **TWSE Data**
  - 盤後/日資料（非即時逐筆）
- **LINE Bot**
  - 使用者查詢「昨日報告 / 建議 / 狀態」等
- **mo CLI**
  - 本機維運：doctor/status/pack/deploy/logs/watch/quick/send

## High-level Diagram

```mermaid
flowchart TD
  Cron[Cron: */15] --> Tick[Tick dispatcher]
  Tick --> Worker[Worker main]

  Worker -->|fetch daily data| TWSE[TWSE APIs]
  Worker -->|write/read| D1[(D1 Database)]

  LINE[LINE webhook] --> Worker
  Worker -->|reply| LINE

  Worker -->|generate recommendations| Strategy[Strategy]
  Strategy -->|PENDING orders| D1

  Worker -->|simulate fills (OHLC)| Sim[Simulation]
  Sim -->|update order status| D1
```

## Key Design Principles

1. **觀察/建議 與 盤後摘要解耦**
   - TWSE 盤後資料可能延遲；摘要可以延後，但 **建議/模擬不應被卡死**。
2. **模擬成交**
   - 以日 OHLC（high/low）判斷是否觸及入場區間。
   - 用於驗證策略，不代表真實成交。
3. **全球市場可擴充**
   - tick 不分星期/時段的硬編碼；以市場 session 模組判斷。

