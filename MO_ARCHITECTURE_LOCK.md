# MO Architecture Lock

## Locked Architecture
LINE Bot → Cloudflare Workers → D1 Database

## Locked Constraints
- Runtime logic must run in Cloudflare Workers
- D1 remains the core structured storage layer
- LINE remains the primary user-facing delivery path
- Local scripts remain tooling only

## Explicitly Prohibited
- Local daemon replacing Workers
- Broker execution integration
- Private runtime sidecar replacing documented system flow
- Replacing authoritative dates with informal convenience fields

## Change Control
Any change to the locked architecture must be treated as a redesign, not a patch.
