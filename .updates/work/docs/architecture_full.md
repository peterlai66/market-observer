# System Architecture (完整版)

> 定位：**智慧型市場觀察及投資決策專家**（僅提供建議與模擬，不做實際交易下單）

## 1) 元件總覽

```mermaid
flowchart LR
  subgraph Edge[Cloudflare Workers]
    W[Worker Runtime\n(src/index.ts)]
    Cron[Cron Triggers\n*/15 * * * *]
    Admin[/admin/run?token=.../]
    Webhook[/webhook (LINE)/]
  end

  subgraph Data[D1 Database]
    DM[mo_daily_mark\n(盤後 ready 標記)]
    TS[twse_daily_summary\n(盤後摘要文字)]
    OA[tick_audit\n(每 15 分鐘心跳/鎖)]
    OR[mo_orders\n(建議/模擬單)]
    EM[execution_mark\n(模擬成交紀錄/去重)]
  end

  subgraph Upstream[Market Data Providers]
    TWSE1[TWSE Index / MI_INDEX]
    TWSE2[TWSE TradeDate / FMTQIK]
    TWSE3[TWSE Stocks Snapshot\n(成交額/漲跌家數…)]
    OHLC[OHLC Provider\n(用於隔日 high/low 模擬成交)]
  end

  subgraph LINE[LINE Platform]
    U[User]
    L[LINE Messaging API]
  end

  Cron --> W
  Admin --> W
  Webhook --> W

  W <--> DM
  W <--> TS
  W <--> OA
  W <--> OR
  W <--> EM

  W --> TWSE1
  W --> TWSE2
  W --> TWSE3
  W --> OHLC

  U --> L --> Webhook
  W --> L
```

## 2) 責任分工

- **Cron (*/15)**：統一節奏的 tick（全球市場友善），負責派工、去重鎖、觸發需要的流程。
- **admin/run**：你手動驗證與緊急補跑用（不依賴 cron）。
- **LINE webhook**：只做「查詢/回覆」；不做重運算（避免 1s~ 的超時與 canceled）。
- **D1**：所有狀態都可回溯（摘要、建議、tick audit、成交紀錄）。

## 3) 核心設計原則

1. **分離 Summary 與 Orders**：TWSE not-ready 只影響摘要，不阻斷建議與模擬。
2. **可重放**：同一個 trade_date 的流程可以安全重跑（靠 D1 去重/標記）。
3. **不做真實下單**：所有「成交」僅為模擬（OHLC high/low 觸及區間）。

