-- v1 strategy tables for market-observer

PRAGMA foreign_keys = ON;

-- 1) 系統狀態表（只需要一筆：id=1）
CREATE TABLE IF NOT EXISTS strategy_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  -- 策略池本金（固定 300000）
  pool_principal_twd INTEGER NOT NULL DEFAULT 300000,

  -- 現金（策略池內）
  cash_twd REAL NOT NULL DEFAULT 300000,

  -- 目前持倉（單一標的 v1）
  current_symbol TEXT,            -- e.g. "3037"
  current_name TEXT,              -- e.g. "欣興"
  position_shares REAL NOT NULL DEFAULT 0,  -- 零股
  entry_price REAL,               -- 理論進場價（收盤）
  entry_date TEXT,                -- YYYY-MM-DD（交易日）
  hold_days INTEGER NOT NULL DEFAULT 0,

  -- 風控/模式
  mode TEXT NOT NULL DEFAULT 'NORMAL',      -- NORMAL / SLOW
  consecutive_losses INTEGER NOT NULL DEFAULT 0,

  -- 統計（出場才算一筆 trade）
  trade_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  loss_count INTEGER NOT NULL DEFAULT 0,

  -- 停損門檻（預設 -12%）
  stop_loss_pct REAL NOT NULL DEFAULT -0.12,

  -- 記錄用
  last_action TEXT,               -- BUY / ADD / HOLD / TRIM / EXIT / SKIP
  last_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 確保 id=1 存在（若已存在就忽略）
INSERT OR IGNORE INTO strategy_state (id) VALUES (1);

-- 2) 交易紀錄（每次出場一筆）
CREATE TABLE IF NOT EXISTS trade_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  symbol TEXT NOT NULL,
  name TEXT,

  entry_date TEXT NOT NULL,       -- YYYY-MM-DD（交易日）
  entry_price REAL NOT NULL,
  entry_shares REAL NOT NULL,

  exit_date TEXT NOT NULL,        -- YYYY-MM-DD（交易日）
  exit_price REAL NOT NULL,
  exit_shares REAL NOT NULL,

  pnl_twd REAL NOT NULL,          -- 已實現損益（TWD）
  return_pct REAL NOT NULL,       -- 已實現報酬（例如 0.053）

  exit_reason TEXT NOT NULL,      -- STOPLOSS / SIGNAL / MANUAL(optional)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_log_exit_date ON trade_log(exit_date);
CREATE INDEX IF NOT EXISTS idx_trade_log_symbol ON trade_log(symbol);

-- 3) 每日績效快照（含浮動報酬：你選 B）
CREATE TABLE IF NOT EXISTS daily_mark (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  trade_date TEXT NOT NULL,       -- YYYY-MM-DD（交易日）
  symbol TEXT,                    -- 若當天有持倉
  close_price REAL,               -- 該標的收盤價（用來算市值）
  cash_twd REAL NOT NULL,
  position_shares REAL NOT NULL,
  position_value_twd REAL NOT NULL,
  total_equity_twd REAL NOT NULL, -- cash + position_value
  return_pct REAL NOT NULL,       -- (total_equity / pool_principal) - 1

  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(trade_date)              -- 同一交易日只留一筆
);

CREATE INDEX IF NOT EXISTS idx_daily_mark_trade_date ON daily_mark(trade_date);