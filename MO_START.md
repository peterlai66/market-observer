# MO_START

# AI Boot Sequence

任何 AI 接手 Market Observer 專案時，
必須先依序讀取以下文件：

1. MO_START.md
2. docs/AI_MEMORY.md
3. docs/NEXT_TASK.md

讀取完成後才允許開始開發或修改。

GitHub repository 為唯一 Source of Truth：
https://github.com/peterlai66/market-observer

## Source of Truth Rule

Market Observer (MO) 的唯一正式版本來源為：

GitHub Repository  
https://github.com/peterlai66/market-observer

### Rule 1

GitHub `main` branch 視為最新正式基準。

AI 在進行任何：

- 開發
- 分析
- handoff
- release
- patch
- cleanup
- 結構整理

之前，必須先以 GitHub repo 內容作為基準。

### Rule 2

若 AI 手上的版本、對話內容、暫存理解、或 zip 檔內容與 GitHub repo 不一致：

禁止直接繼續開發。

必須先確認：

- GitHub 是否已是最新
- 或請使用者提供最新 local dev / release 包

### Rule 3

AI 不得將自己的記憶、暫存檔、舊對話內容視為最新版。

只有以下可視為有效版本來源：

1. GitHub repo
2. 使用者明確提供的最新 dev zip
3. 使用者明確提供的最新 release zip

### Rule 4

若 GitHub 與使用者 local 版本一致，後續修改應以 GitHub repo 現況為基準延伸，不可脫離 repo 自行重建文件或流程。

### Rule 5

版本號唯一來源為 repo 根目錄 `VERSION`。

AI 不可自行推測版本號。
runtime version 必須遵循 `VERSION` 所定義的值。

---

## Fixed Deployment Architecture

LINE Bot → Cloudflare Workers → D1 Database

MO 是 Expert System，只做：

- 市場分析
- 研究
- 模擬
- 推薦支援

MO 不做：

- 真實交易執行
- 券商串接
- 真實資金管理

---

## Release Rule

固定流程：

AI 交付候選版
→ local update
→ doctor / smoke-worker / 指定驗證
→ deploy
→ 功能驗證
→ AI 明確判定可 release
→ git commit
→ git push

### Important

- update != release
- deploy != git sync
- GitHub 必須在 release 後回到最新基準

Generated: 2026-03-16 04:29:34 UTC
