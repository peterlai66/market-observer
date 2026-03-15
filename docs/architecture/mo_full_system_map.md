# MO Full System Map

External Layer:
LINE Messaging API
↓
Cloudflare Worker webhook

Core Engine:
Market Data
↓
Cycle
↓
Recommendation
↓
Simulation
↓
Review
↓
Review-save
↓
Scoreboard
↓
Operator Delivery
↓
Knowledge Base

Key Data Tables:
- prices_daily
- mo_orders
- mo_execution_mark
- mo_positions
- mo_portfolio_state
- mo_recommendation_review_batches
- mo_recommendation_review_items
