# Market Observer (MO) – AI Handoff Guide

Market Observer is an Expert System focused on market analysis, research, learning, and simulation-based validation.

## Required Reading Order

Before changing code, read in this order:

1. MO_START.md
2. docs/README.md
3. docs/AI_MEMORY.md
4. docs/NEXT_TASK.md
5. docs/MO_DATE_MODEL.md
6. docs/architecture/mo_system_architecture.md
7. docs/architecture/mo_full_system_map.md
8. docs/architecture/mo_engineering_map.md
9. docs/architecture/mo_ai_guardrails.md
10. docs/lifecycle/mo_runtime_pipeline.md
11. docs/simulation_model.md
12. docs/operator/operator_report_model.md
13. docs/operator/line_commands.md
14. docs/operator/ai_explain_layer.md
15. docs/development/release_workflow.md
16. docs/development/dev_package_flow.md
17. docs/development/update_system.md
18. docs/development/handoff_protocol.md

## Deployment Model

LINE Messaging API
↓
Cloudflare Workers
↓
MO Engine

All runtime logic must execute inside Cloudflare Workers.

Local CLI scripts are tooling only:
- diagnostics
- validation
- review scoring
- packaging

## Handoff Protocol

When the user says `handoff`, the AI must:

1. read repository state
2. reconcile docs with repo and prior decisions
3. update missing documentation if needed
4. preserve worker-first architecture
5. produce a new handoff package

## Current System Identity

MO is not a trading bot.
MO does not connect to brokers.
MO does not execute trades.

MO is a market research, recommendation validation, and knowledge-building system.
