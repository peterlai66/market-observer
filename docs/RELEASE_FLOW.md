# Release Flow

MO 固定採用：

AI 交付候選版
→ local update
→ doctor / smoke-worker / 指定驗證
→ deploy
→ 功能驗證
→ AI 明確判定可 release
→ git commit
→ git push

## 重點
- update != release
- deploy != git sync
- release 後 GitHub 必須回到最新基準
