# MO System Contract

## Contract 1: Expert System Boundary
MO performs analysis, research, explanation, simulation, and recommendation support only.

## Contract 2: Runtime Boundary
Cloudflare Workers is the runtime authority.

## Contract 3: Delivery Boundary
LINE is the operator-facing interface.

## Contract 4: Persistence Boundary
D1 stores structured system state and analysis artifacts.

## Contract 5: Git / Release Boundary
A release is not considered baseline until:
1. update completed
2. validation passed
3. deploy completed
4. runtime verification passed
5. release approved
6. git commit pushed

## Contract 6: Knowledge Continuity
Core governance files must remain readable and current so new AI instances can continue reliably.
