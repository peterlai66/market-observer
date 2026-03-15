# Market Observer – Architecture Lock

This document defines architectural decisions that must not be changed without explicit approval from the repository owner.

## 1. Deployment Model (LOCKED)

The deployment architecture is fixed:

LINE Messaging API
↓
Cloudflare Workers
↓
MO Engine

AI must NOT introduce:
- server-based runtime
- background daemons
- persistent backend servers
- local runtime services

## 2. Runtime Model (LOCKED)

Runtime logic must execute in Cloudflare Workers.
Local scripts are tooling only.

## 3. CLI Entry (LOCKED)

Primary CLI entry:
scripts/mo.mjs

AI must not create parallel CLI systems such as:
- dev-cli
- runtime-cli
- mo2

## 4. Repository Structure (LOCKED)

Core directories must remain:
src/
scripts/
docs/
developer/
migrations/

## 5. Architecture Change Protocol

If architectural changes are proposed, AI must:
1. explain the reason
2. describe the impact
3. request user approval
