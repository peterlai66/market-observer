# Simulation Model

MO 的成交是 **模擬**（不做真實交易）。

## 模擬成交判斷（區間觸及）

- 前提：有 `exec_date` 當日的 OHLC（high/low）。
- 判斷：

```text
if (low <= entry_high) AND (high >= entry_low)
  => FILLED
else
  => keep PENDING (盤中) / EXPIRED (收盤後可結算)
```

> 目前架構偏向「日線 OHLC 模擬」，不是即時 tick quote。

