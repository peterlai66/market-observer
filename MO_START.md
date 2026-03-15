# Market Observer (MO)

## Core Identity
Market Observer (MO) is an **Expert System** for:

- market analysis
- research
- simulation
- recommendation support

MO does **not** execute trades and does **not** connect to brokers.

## Fixed Deployment Architecture
LINE Bot → Cloudflare Workers → D1 Database

### Runtime Rules
- LINE Bot = interaction layer
- Cloudflare Workers = runtime layer
- D1 Database = persistence layer
- local CLI / scripts = tooling only

Local tooling must never become the runtime system.

## Canonical Source
GitHub repository is the canonical source of truth.

Temporary artifacts such as:
- release zip
- handoff zip
- backup zip

are transfer media only, not canonical history.

## Required AI Reading Order
1. MO_START.md
2. MO_PROJECT_MANIFEST.md
3. MO_SYSTEM_PHILOSOPHY.md
4. MO_ARCHITECTURE_LOCK.md
5. MO_SYSTEM_CONTRACT.md
6. MO_KNOWLEDGE_SYSTEM.md
7. docs/AI_MEMORY.md
8. docs/NEXT_TASK.md
9. architecture/
10. contracts/
11. pipeline/
12. runtime/
13. ai/
14. src/ and scripts/

## Release Rule
update → validate → deploy → verify → AI release judgment → git commit → git push

Important:
- update != release
- deploy != git sync
- only after validation and explicit release approval should Git be updated

Generated: 2026-03-15T17:25:51.173169+00:00
