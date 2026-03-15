-- v1.2 runtime audit tables (Market Observer)
PRAGMA foreign_keys = ON;

-- Dispatcher / tick level audit (每 15 分鐘觸發一次：去重鎖、分派任務、成功/失敗統計)
CREATE TABLE IF NOT EXISTS mo_tick_audit (
  tick_id TEXT PRIMARY KEY,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_ms INTEGER,
  lock_status TEXT NOT NULL DEFAULT 'unknown',
  jobs_planned INTEGER NOT NULL DEFAULT 0,
  jobs_done INTEGER NOT NULL DEFAULT 0,
  jobs_failed INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_mo_tick_audit_triggered_at ON mo_tick_audit(triggered_at);

-- Per-day post-close status (盤後資料是否就緒、是否已推播、摘要)
CREATE TABLE IF NOT EXISTS mo_daily_mark (
  trade_date TEXT PRIMARY KEY,
  ready_level TEXT NOT NULL DEFAULT 'NONE',
  fetched_at TEXT,
  pushed_at TEXT,
  key_summary TEXT,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mo_daily_mark_updated_at ON mo_daily_mark(updated_at);

-- Orders / execution marks (simulation fills + future real fills)
CREATE TABLE IF NOT EXISTS mo_execution_mark (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_date TEXT,
  trade_date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  qty REAL NOT NULL,
  price REAL,
  entry_low REAL,
  entry_high REAL,
  filled INTEGER NOT NULL DEFAULT 0,
  filled_price REAL,
  filled_at TEXT,
  alpha_score REAL,
  weight REAL,
  rule_version TEXT NOT NULL DEFAULT 'ohlc_hilo_v1',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mo_execution_mark_trade_date ON mo_execution_mark(trade_date);
CREATE INDEX IF NOT EXISTS idx_mo_execution_mark_symbol ON mo_execution_mark(symbol, trade_date);
