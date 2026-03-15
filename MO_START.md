# Market Observer (MO)

## System Overview
Market Observer (MO) is an Expert System designed for **market observation, analysis, research, and simulation**.

MO **does NOT execute trades** and **does NOT connect to brokers**.  
It is strictly an **analysis and decision‑support system**.

Primary deployment architecture:

LINE Bot → Cloudflare Workers → D1 Database

All runtime logic must execute inside **Cloudflare Workers**.

---

## Architecture Lock

The following architecture elements are locked and must not be altered without explicit redesign:

- LINE Bot = user interaction layer
- Cloudflare Workers = runtime logic layer
- D1 Database = data persistence
- Local CLI scripts = tooling only (not runtime)

Local scripts must **never become server processes**.

---

## System Philosophy

MO is an **Expert System**, not an automated trading system.

Purpose:

- Observe markets
- Analyze signals
- Simulate portfolio outcomes
- Provide research insight

MO must never:

- Execute trades
- Connect to broker APIs
- Manage real capital

---

## Source of Truth

The authoritative code base is:

GitHub repository  
https://github.com/peterlai66/market-observer

Rules:

- GitHub is the canonical source
- Local environment is the working development environment
- Release / handoff ZIP files are only temporary transfer artifacts

---

## AI Handoff Reading Order

When a new AI instance continues development it must read files in this order:

1. MO_START.md
2. MO_PROJECT_MANIFEST.md
3. MO_SYSTEM_PHILOSOPHY.md
4. MO_ARCHITECTURE_LOCK.md
5. MO_SYSTEM_CONTRACT.md
6. MO_KNOWLEDGE_SYSTEM.md
7. docs/AI_MEMORY.md
8. docs/NEXT_TASK.md
9. docs/

Only after understanding these documents should the AI read source code.

---

## Development Workflow

Standard workflow:

AI development → Local update → Validation → Deploy → Verification → Release → Git commit

Detailed steps:

1. Receive release candidate from AI
2. Run local update
3. Run validation checks
4. Deploy Worker
5. Verify runtime behavior
6. AI confirms release readiness
7. Commit and push to GitHub

Important rules:

- update ≠ release
- deploy ≠ Git synchronization

---

## Git Workflow

Typical commands:

git status  
git add .  
git commit -m "message"  
git push

GitHub must always reflect the **latest stable baseline**.

---

Generated: 2026-03-15T17:22:50.004899 UTC
