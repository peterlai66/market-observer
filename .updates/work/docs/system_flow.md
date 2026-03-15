## 0.14.4 daily cycle dispatch
- Tick 不再只視 report 為盤後一次性任務；現在會在 cycle window 內重試直到隔日開盤前。
- Worker 先更新 `mo_cycle_state`，再依 `summary_ready / recommendation_ready / simulation_seeded / actionable` 判斷是否進入 report_ready / core_ready / actionable_ready。
- report push 與 recommendation/simulation bootstrap 已拆開，避免 20 交易日模擬被 report 缺席卡死。

# System Flows

## A) tick（每 15 分鐘）

```mermaid
sequenceDiagram
  autonumber
  participant Cron as Cron */15
  participant W as Worker
  participant D1 as D1

  Cron->>W: scheduled()
  W->>D1: tick_audit lock (dedupe)
  alt lock acquired
    W->>W: heartbeat + dispatch jobs
    W->>W: maybe run daily pipeline
    W->>W: maybe simulate pending orders
    W->>D1: tick_audit done + stats
  else lock exists
    W->>D1: tick_audit skip
  end
```

## B) daily pipeline（盤後摘要 + 建議/單）

```mermaid
flowchart TD
  A[determine trade_date] --> B[fetch TWSE trade date/index]
  B --> C{TWSE snapshot ready?}
  C -- yes --> D[build & upsert twse_daily_summary]
  C -- no --> D2[skip summary (safe)]
  D --> E[generate recommendations]
  D2 --> E
  E --> F{recs empty?}
  F -- yes --> G[fallback seed (ETF)]
  F -- no --> H[use recs]
  G --> I[upsert mo_orders (signal_date)]
  H --> I
```

## C) LINE webhook（查詢/回覆）

```mermaid
flowchart TD
  U[User message] --> W[/webhook/]
  W --> P{command?}
  P -- 昨日報告 --> Q[read twse_daily_summary]
  P -- 建議 --> R[read mo_orders PENDING]
  Q --> S[reply]
  R --> S
```

