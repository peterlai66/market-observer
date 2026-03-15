# Release & Basic Test

## Deploy

```bash
npm run deploy
```

## Tail logs

```bash
npx wrangler tail --format pretty
```

## Manual trigger

```text
GET /admin/run?token=YOUR_TOKEN
```

## DB quick checks

- 最近摘要：
```sql
SELECT date, LENGTH(summary_text) AS len, created_at
FROM twse_daily_summary
ORDER BY date DESC
LIMIT 3;
```

- 明日建議（PENDING）：
```sql
SELECT id, signal_date, exec_date, side, symbol, entry_low, entry_high, qty, status
FROM mo_orders
WHERE status='PENDING'
ORDER BY created_at DESC
LIMIT 20;
```

- tick 稽核：
```sql
SELECT * FROM mo_tick_audit ORDER BY triggered_at DESC LIMIT 10;
```

