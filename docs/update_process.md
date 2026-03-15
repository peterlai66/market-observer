# Update Process

## local → AI
1. 使用者在 local 專案目錄執行 `npm run mo -- pack`
2. 產生 `.updates/outbox/market-observer_dev_latest.zip`
3. 使用者把該 zip 上傳到聊天室

## handoff
當使用者在聊天室輸入 `handoff` 並附上 local 打包檔時：
1. AI 檢查是否有附檔
2. AI 讀取並比對聊天室規則 / repo 差異 / 未修 bug / 文件缺失
3. 可修正的直接修；來不及修的寫進 handoff 記錄
4. AI 產出新的 `mo_handoff_YYYYMMDD_HHMM.zip`
5. AI 不可把使用者上傳的 local pack 直接改名交付
6. 使用者在新視窗輸入：`讀取檔案中的 MO_START.md 並繼續開發專案`

## patch（修工具鏈）
1. AI 交付 `market-observer_patch_latest.zip`
2. 使用者放入 `.updates/inbox/`
3. 執行 `npm run mo -- patch`
4. `mo patch` 會：
   - 建立 `.updates/repo-backup/` 工具鏈快照
   - 驗證 backup 非空
   - 清空並解壓到 `.updates/work/`
   - 驗證 work 非空
   - 套用到 repo root
   - 成功後才把 zip 移到 `.updates/bak/`
   - 寫入 `.updates/history/`
   - 清理 `.updates/backup` 與廢棄 outbox 子目錄（若存在）
5. 若失敗，`inbox` 內原始 zip 必須保留

## release → update（完整更新）
1. AI 交付 `market-observer_release_latest.zip`（正式 release 不得使用版本號式檔名）
2. 使用者放入 `.updates/inbox/`
3. 執行 `npm run mo -- update`
4. `mo update` 會：
   - 建立 `.updates/repo-backup/` repo 快照
   - 驗證 backup 非空
   - 清空並解壓到 `.updates/work/`
   - 驗證 work 非空
   - 套用到 repo root
   - 成功後才把 zip 移到 `.updates/bak/`
   - 寫入 `.updates/history/`
   - 清理 `.updates/backup` 與廢棄 outbox 子目錄（若存在）
5. 若失敗，`inbox` 內原始 zip 必須保留

## `.updates` contract
- `inbox/`：等待套用的 patch / release 包
- `work/`：patch / update staging 區
- `bak/`：已使用的 patch / release 歷史
- `repo-backup/`：patch / update 前的備份
- `outbox/`：dev / patch / release / handoff 的最新 zip 輸出根目錄
- `outbox/bak/`：舊 `_latest.zip` 歷史歸檔
- `history/`：流程與操作歷史

### Deprecated
以下目錄已廢棄，update / patch / sync-structure 必須自動清理：
- `outbox/dev/`
- `outbox/patch/`
- `outbox/release/`
- `outbox/handoff/`
- `.updates/backup/`

## version source
- 檔名中的 `_latest` 只是入口別名
- 真正版本來源：`manifest.json`、`VERSION`、`RELEASE_NOTES.md`

## smoke validation
- 執行 `npm run mo -- smoke` 可在暫存 repo 驗證 pack / patch / release / update 與 deprecated cleanup。
- 正式交付前，若工具鏈有改動，必須至少跑一次 smoke 驗證。

## artifact validation
- 正式 release 產出後，必須先執行 `npm run mo -- validate-artifacts`。
- 驗證內容至少包含：`market-observer_release_latest.zip` 是否存在、`.updates/outbox/` 是否沒有 deprecated 子目錄、是否沒有其他 versioned release zip。
