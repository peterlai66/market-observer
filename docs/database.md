# Database Schema (概覽)

> 以「可回溯、可重跑」為核心。

## mo_orders

- 用途：保存「建議」與「隔日模擬」的單。
- 重要欄位：
  - `signal_date`：產生建議的日期
  - `exec_date`：預期執行/模擬成交的日期
  - `entry_low/entry_high`：區間觸發
  - `status`：PENDING / FILLED / EXPIRED

## twse_daily_summary

- 用途：盤後摘要文字快取，LINE 查詢直接回。

## mo_daily_mark

- 用途：標記某 `trade_date` 的資料 ready 等級（避免抓到前一日）。

## tick_audit

- 用途：每 15 分鐘 tick 的鎖與稽核（避免重複跑）。

## execution_mark

- 用途：模擬成交去重、記錄每筆單是否已處理。

