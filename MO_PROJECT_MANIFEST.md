# Market Observer (MO) – Project Manifest

Market Observer (MO) is a recommendation validation system designed to evaluate whether ETF recommendations have edge.

MO is NOT a trading engine.
MO is NOT a brokerage integration.
MO is a research and validation system.

## Core Objective

MO evaluates ETF recommendations within a 20 trading day window.

Primary question:

Does the recommendation system produce positive expectancy?

MO focuses on:
- recommendation validation
- simulation-based evaluation
- performance diagnostics

## System Deployment

LINE Messaging API
↓
Cloudflare Workers
↓
MO Engine

All runtime logic executes inside Workers.
Local scripts are tooling only.

## System Pipeline

market data
↓
cycle
↓
recommendation
↓
simulation
↓
review
↓
review-save
↓
scoreboard

## Final Definition

Market Observer is a:
Worker-native,
AI-documented,
simulation-based
recommendation validation system.
