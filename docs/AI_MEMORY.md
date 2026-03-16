# AI Memory

## Canonical Baseline
MO 的 canonical baseline 為 GitHub repo：

https://github.com/peterlai66/market-observer

## Operational Rule
只要 GitHub 與 local VERSION 一致，AI 應以 GitHub repo 現況作為後續修改基礎。

## Version Rule
唯一版本來源：`VERSION`

不可使用：
- AI 記憶中的舊版本
- 過時的 handoff 理解
- 未確認的新舊 zip 包內容
