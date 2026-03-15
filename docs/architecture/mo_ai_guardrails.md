# MO AI Guardrails

## Core Principles

1. Worker-first runtime
All runtime logic must execute inside Cloudflare Workers.

2. Repository stability
AI must NOT:
- rename root folders
- move core files
- duplicate documentation trees

3. Scripts policy
scripts/mo.mjs is the primary CLI entry point.
All commands must remain under the `mo` namespace.

4. Documentation policy
AI may add documentation, but must not rewrite historical architecture decisions without approval.
