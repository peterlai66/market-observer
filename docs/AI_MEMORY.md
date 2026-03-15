# AI Memory – Market Observer

This file records long‑term operational knowledge about the MO system.

## Core Architecture

LINE Bot
Cloudflare Workers
D1 Database

Workers execute all runtime logic.

## System Identity

MO is an Expert System.

It performs:

- Market analysis
- Research
- Simulation
- Recommendation generation

It does NOT perform:

- Trade execution
- Broker interaction
- Capital management

## Development Principles

1. Cloudflare Workers remain the runtime environment
2. CLI scripts are development tooling only
3. GitHub is the system's canonical source of truth
4. Release artifacts must not override GitHub history
