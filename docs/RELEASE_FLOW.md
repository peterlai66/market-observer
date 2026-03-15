# Release Flow

MO 固定採用：

AI 交付候選版
→ 本機 update
→ doctor / smoke-worker 驗證
→ deploy
→ 功能驗證
→ AI 判定可 release
→ git commit
→ git push

## 重點
- update != release
- deploy != GitHub 已同步
- 只有 release 判定通過後才更新 Git baseline
