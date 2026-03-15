# Market Observer – System Contract

This document defines the data contracts between system modules.

## 1. Trade Date Contract

referenceTradeDate is authoritative and is determined by:

MAX(
  mo_recommendation_log.trade_date,
  mo_orders.signal_date
)

Forbidden sources:
- mo_cycle_state
- twse_daily_summary

## 2. Date Consistency Contract

The following fields must always represent the same trade cycle:
- recommendation.trade_date
- orders.signal_date
- cycle.trade_date
- summary.date

## 3. Recommendation Contract

A recommendation must contain:
- symbol
- signal_date
- entry_low
- entry_high
- strategy_name
- confidence_score

Stored in:
mo_orders

Statuses:
PENDING / FILLED / EXPIRED

## 4. Simulation Contract

Simulation uses OHLC daily data.

Execution rule:
if (low <= entry_high) AND (high >= entry_low)
    FILLED
else
    PENDING / EXPIRED

## 5. Operator Delivery Contract

Operator reports are delivered through LINE.

Operator layer must never:
- trigger database writes
- trigger strategy runs

It is a read-only delivery layer.
