# Market Observer (MO)

Market Observer 是以 Cloudflare Workers、D1、TWSE OpenAPI 與 LINE 為核心的盤後市場觀察專案。

## 入口
請先閱讀：`MO_START.md`

## 推薦本地用法
```bash
npm install
npm run mo -- doctor
npm run mo -- pack
npm run mo -- patch
npm run mo -- release
npm run mo -- update
```

## CLI 備註
- `npm run mo -- <command>` 是推薦用法，不需要先 `npm link`
- `mo patch` 用於修工具鏈
- `mo update` 用於完整更新
- `mo update` 與 `mo upgrade` 等價
- `mo pack` 是 local 快照，不是 handoff

## Handoff
聊天切換時，只有使用者明確輸入：

```text
handoff
```

AI 才會整理未回寫內容並產生新的 handoff zip。
