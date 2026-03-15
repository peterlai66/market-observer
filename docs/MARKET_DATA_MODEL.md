
# MARKET_DATA_MODEL.md

Market Observer Market Data Architecture (v0.20)

## Purpose
Define all market data sources used by MO so future development and AI handoff can maintain consistent data structure.

## Data Categories
1. Market Index
2. Market Breadth
3. Market Flow
4. Derivatives Risk
5. Global Market

## Market Index
Source: TWSE MI_INDEX
Fields:
- tradeDate
- taiexOpen
- taiexHigh
- taiexLow
- taiexClose
- change
- pctChange
- volume
- turnover

## Market Breadth
Fields:
- advancers
- decliners
- unchanged
- limitUp
- limitDown

Derived:
breadthRatio = advancers / decliners

## Market Flow
Source: TWSE T86
Fields:
- foreignBuy
- foreignSell
- foreignNet
- trustNet
- dealerNet

Derived:
- foreignFlow5d
- foreignFlow20d

## Derivatives Risk
Source: TAIFEX
Fields:
- txOpenInterest
- longShortRatio
- tvix

## Global Market
Indices:
- SPX
- NDX
- SOX
- VIX

Purpose:
Provide global sentiment reference for Taiwan market.

## Storage Model

market_summary:
- tradeDate
- taiexClose
- turnover
- breadthRatio
- foreignNet
- foreignFlow5d
- newHigh20
- newLow20
- spx
- sox
- vix

market_cycle_input:
- tradeDate
- trendScore
- breadthScore
- flowScore
- globalScore
- riskScore

## Design Principle
Collect full market data first.
Strategy decides how to use it later.
