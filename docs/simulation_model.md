# Simulation Model

MO uses OHLC daily simulation.

Fill rule:

if (low <= entry_high) AND (high >= entry_low)
    FILLED
else
    PENDING / EXPIRED

Execution policy:
SIM_FILL_POLICY
- STRICT_RANGE
- RANGE_OR_CLOSE
- NEXT_OPEN
