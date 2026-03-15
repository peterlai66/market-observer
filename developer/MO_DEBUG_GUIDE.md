## 0.10.0 cost-aware debug
- Selected / rejected rows now include trade-cost context.
- Common reasons:
  - `qty_too_small`: 低於市場最小下單量
  - `notional_too_small`: 名目金額過小
  - `edge_lt_cost`: 預估優勢不足以覆蓋往返成本
- Execution now deducts fee / tax / slippage from cash, so compare `mo_orders`, `mo_positions`, `mo_portfolio_state` together.

# MO DEBUG GUIDE

## update / patch 自檢
成功時至少要檢查：
- `.updates/repo-backup/` 有新增非空 zip
- `.updates/bak/` 有新增已吃掉的 package
- `.updates/history/` 有新增 json 記錄
- 終端機有成功摘要

若 `VERSION` 改了但上述三者沒有新增，不能視為 update 成功。


## Strategy debug (0.8.4)
- LINE: `debug` / `除錯`
- D1: `SELECT * FROM mo_strategy_debug ORDER BY id DESC LIMIT 20;`
- Purpose: explain why candidates were selected or rejected in the latest run.


## 0.9.0
- Use LINE `debug` first.
- If needed, inspect `mo_strategy_debug` in D1.
- `starter_fallback` means the engine saw candidates but normal gates still produced zero recs, so it opened an observation-style recommendation.

## 0.9.1 price source
- Candidate/debug lines include `px=<source>` so you can tell whether the recommendation used `raw.close`, `raw.ohl_avg`, `priceByCode.close`, or fell back to `missing`.
