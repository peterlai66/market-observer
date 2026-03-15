# MO Engineering Map

Worker Layer:
LINE Webhook
↓
Cloudflare Worker (src/index.ts)

Rendering Layer:
render.ts
↓
report payload
↓
LINE response

prompt.ts
↓
AI narration payload
↓
AI explain layer

Script / CLI Layer:
scripts/mo.mjs

Primary commands:
- doctor
- guard
- sanity
- validate
- preflight
- runtime-invariants
- portfolio-verify
- recommendation-review
- recommendation-review-save
- recommendation-scoreboard
