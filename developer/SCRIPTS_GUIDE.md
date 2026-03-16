# Developer Scripts Guide

## Source of Truth
在任何 CLI、cleanup、release、migration、handoff 操作前：

先確認 GitHub repo 是否為當前正式基準。

Repository:
https://github.com/peterlai66/market-observer

## Version Authority
版本號以根目錄 `VERSION` 為唯一來源。

## Safe Workflow
1. 確認 GitHub baseline
2. local update / validate
3. deploy
4. verify
5. release judgment
6. git commit / push
