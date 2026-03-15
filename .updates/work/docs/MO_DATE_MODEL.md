# MO Date Model (Market Observer 日期架構)

本文件定義 MO 系統所有日期來源與責任層級，避免日期污染。

Market Trade Date → Data Date → Strategy Date → Report Date

## Strategy Date 為唯一 referenceTradeDate 來源

referenceTradeDate = MAX(
  mo_recommendation_log.trade_date,
  mo_orders.signal_date
)

## 禁止來源
- mo_cycle_state
- twse_daily_summary

## 非交易日規則
- 週末與假日不得建立新 trade_date
- 必須沿用 latestTradingDate

## Date Consistency Check
recommendation.trade_date
orders.signal_date
cycle.trade_date
summary.date

四者必須一致。
