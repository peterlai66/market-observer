# MO Architecture Integration

Date: 2026-03-15

本文件為 Market Observer (MO) 系統架構整合說明。

用途： - 將今日架構討論整理成正式規格 - 提供後續 AI 將內容整合到 MO 文件

需更新的文件： - docs/architecture.md - docs/database.md -
docs/AI_MEMORY.md - docs/MO_START.md（必要時補充）

------------------------------------------------------------------------

# 1. System Positioning

MO（Market Observer）定位為：

**智慧型市場觀察及投資決策專家**

系統提供： - 市場觀察 - 盤後摘要 - 投資建議 - 模擬驗證

重要限制： MO **不會送出真實券商下單**

所有成交僅為： simulation / backtesting / verification

系統定位：Decision Support System\
而非：Trading Execution System

------------------------------------------------------------------------

# 2. Core System Components

## Cloudflare Worker

主要運行環境。

Endpoints: /webhook\
/admin/run

Cron: */15 * \* \* \*

用途： - tick dispatcher - scheduler - workflow orchestrator

## LINE Bot

LINE 為使用者介面。

提供： status\
report\
recommendation\
help

LINE webhook **只做查詢回覆**

不做： heavy computation\
strategy generation\
simulation

## D1 Database

MO 的狀態儲存層。

主要保存： summary\
recommendations\
simulation results\
runtime audit

## Market Data Providers

目前資料來源： TWSE Index\
TWSE TradeDate\
TWSE Snapshot\
OHLC Provider

資料為：daily / post‑market\
非逐筆即時行情。

## mo CLI

本機維運工具。

主要指令： doctor\
status\
pack\
deploy\
logs\
watch\
quick\
send

------------------------------------------------------------------------

# 3. Runtime Architecture

Worker / Cron / LINE / Market Data / D1 互相互動的系統流程。

主要邏輯：

Cron Tick\
↓\
Worker Dispatch\
↓\
Fetch Market Data\
↓\
Generate Summary\
↓\
Generate Recommendations\
↓\
Store Orders\
↓\
Next‑day Simulation

------------------------------------------------------------------------

# 4. Database Design Overview

MO database 設計核心：

replay‑safe\
auditable\
traceable

## mo_orders

用途： 保存策略產生的投資建議與模擬成交結果。

重要欄位： signal_date\
exec_date\
symbol\
entry_low\
entry_high\
status

status: PENDING\
FILLED\
EXPIRED

## twse_daily_summary

用途： 保存盤後摘要，LINE 查詢可直接回覆。

## mo_daily_mark

用途： 標記某 trade_date 的資料 ready 狀態。

避免： 抓到前一日資料\
抓到半成品資料

## tick_audit

用途： 記錄每 15 分鐘 tick 的執行狀態。

用途包含： dispatcher lock\
cron audit\
runtime tracing

## execution_mark

用途： 模擬成交去重。

避免： 同一筆 order 被重複模擬處理。

------------------------------------------------------------------------

# 5. Core Design Principles

## Summary 與 Orders 解耦

TWSE 盤後資料可能延遲。

summary / recommendation / simulation\
必須互相獨立。

## Replay‑safe

同一個 trade_date 的流程可以安全重跑。

依賴： D1 flags\
tick_audit\
execution_mark

## Simulation Only

MO 不會進行真實交易。

成交判斷依據： OHLC high / low

## Lightweight LINE Webhook

LINE webhook 僅做： query\
reply

避免 Worker timeout。

## Global Market Ready

tick scheduler： \*/15 cron

市場 session 由策略模組判斷，不硬編碼交易時段。

------------------------------------------------------------------------

# 6. Notes For Next AI

下一個 AI 在讀取此文件後應：

1.  更新 docs/architecture.md
2.  更新 docs/database.md
3.  將核心原則補入 docs/AI_MEMORY.md
4.  確保不破壞現有 MO_START.md 架構
