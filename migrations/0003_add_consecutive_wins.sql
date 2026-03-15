-- add consecutive_wins for auto-recover slow mode
ALTER TABLE strategy_state ADD COLUMN consecutive_wins INTEGER NOT NULL DEFAULT 0;
