# AI_CONTEXT

## Project
Market Observer (MO)

## Runtime
- Cloudflare Workers
- D1 Database
- TWSE OpenAPI
- LINE push / summary

## Current State
- D0 資料可靠性已是主要焦點
- 已建立 tradeDate quorum 的方向
- 正在建立可持續的 repo / CLI / handoff / update 流程

## Important Constraints
- 使用者不希望對話裡貼大量程式碼
- 開發流程要能支援聊天切換
- 文件、結構、scripts 必須一起維護
- 不要讓 repo 無限長出重複文件或無用檔案

## Local vs Chat Responsibilities
- 本地端：`mo update`、`mo doctor`、`mo logs`
- 聊天端：`Handoff`、規則整理、文件回寫、handoff zip 產出
