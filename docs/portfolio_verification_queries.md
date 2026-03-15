## 0.10.9 portfolio verify
- `npm run mo -- portfolio-verify`
- 預期：依序看到 `portfolio principal=... cash=...`、`positions snapshot ok (...)`。若尚無 executed orders，應看到 `no executed orders yet (closed-loop execution checks skip)` 與 `Portfolio verify OK`。若已有 executed orders，則應再看到 `executed orders snapshot ok (...)`、`execution marks cover executed orders (...)`、最後 `Portfolio verify OK`。

# Portfolio Verification Queries

## 0.10.5 runtime invariants
- `npm run mo -- runtime-invariants`
- 預期：依序看到 `portfolio_state`、`positions checked`、`snapshot fresh against execution marks`（或 no execution marks skip）、`executed orders all have exec_date`、最後 `Runtime invariants OK`。

## 手動 PowerShell 查詢
- `npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT id, principal_twd, cash_twd, updated_at FROM mo_portfolio_state WHERE id=1;"`
- `npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT symbol, shares, avg_cost, updated_at FROM mo_positions ORDER BY symbol;"`
- `npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT id, signal_date, trade_date, symbol, side, qty, filled, created_at FROM mo_execution_mark ORDER BY id DESC LIMIT 20;"`
- `npx wrangler d1 execute line_etf_monitor_v36 --remote --command "SELECT id, signal_date, exec_date, symbol, side, qty, status, exec_price, reason FROM mo_orders ORDER BY id DESC LIMIT 20;"`
