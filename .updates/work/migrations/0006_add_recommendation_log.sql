-- v1.3 recommendation tracking
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mo_recommendation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  signal_date TEXT NOT NULL,
  action TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  entry_low REAL,
  entry_high REAL,
  qty REAL,
  weight REAL,
  score REAL,
  reason TEXT,
  is_latest INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mo_recommendation_log_signal_date
  ON mo_recommendation_log(signal_date, is_latest);
CREATE INDEX IF NOT EXISTS idx_mo_recommendation_log_symbol
  ON mo_recommendation_log(symbol, signal_date);
CREATE INDEX IF NOT EXISTS idx_mo_recommendation_log_batch
  ON mo_recommendation_log(batch_id);
