-- v1.1 multi-asset strategy tables (Market Observer)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mo_portfolio_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  principal_twd INTEGER NOT NULL DEFAULT 300000,
  cash_twd REAL NOT NULL DEFAULT 300000,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO mo_portfolio_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS mo_positions (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  shares REAL NOT NULL DEFAULT 0,
  avg_cost REAL NOT NULL DEFAULT 0,
  opened_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mo_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_date TEXT NOT NULL,
  exec_date TEXT,
  side TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  entry_low REAL NOT NULL,
  entry_high REAL NOT NULL,
  qty REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  exec_price REAL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mo_orders_status ON mo_orders(status, signal_date);
CREATE INDEX IF NOT EXISTS idx_mo_orders_symbol ON mo_orders(symbol);
