CREATE TABLE IF NOT EXISTS mo_strategy_debug (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  stage TEXT NOT NULL,
  reason TEXT NOT NULL,
  score REAL,
  chg_pct REAL,
  value_score REAL,
  mom_score REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mo_strategy_debug_trade_date
  ON mo_strategy_debug(trade_date DESC, id DESC);
