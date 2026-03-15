# HANDOFF

## 接手順序
1. 先讀 `MO_START.md`
2. 再讀 `docs/PROJECT.md`、`docs/AI_MEMORY.md`、`docs/NEXT_TASK.md`、`docs/BUGS.md`
3. 確認目前基線與未完成事項
4. 再開始開發

## 目前狀態摘要
- Universe / Candidate / Ranking / Recommendation / Cost Filter / Pending Orders / Simulated Execution 已可運作
- debug 與 recommendation log 已可寫入 D1
- `mo_positions` schema 無 `id` 欄位，查詢應使用 `updated_at` 或直接 `LIMIT`
- 下一階段重點：成交閉環、LINE 狀態升級、進場區間優化、mo guard、mo sanity、MO_AUTOPILOT 設計
