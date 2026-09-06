# cron-orphan-receipt-sweep

Railway cron service: deletes OCR receipt uploads unreferenced for 48+ hours.

## Endpoint

`GET /api/cron/orphan-receipts?dry_run=false&min_age_hours=48`

**Not** `/api/cron/orphan-receipt-sweep` — that path does not exist (404).

## Railway setup

1. Service **Root Directory**: `services/cron-orphan-receipt-sweep`
2. **Cron Schedule** (Settings): `0 19 * * *` (daily 19:00 UTC = 03:00 HKT)
3. Variables:

| Variable | Example |
|----------|---------|
| `CRON_SECRET` | Same value as on `invoice-generator` |
| `APP_URL` | `https://${{invoice-generator.RAILWAY_PUBLIC_DOMAIN}}` |
| `DRY_RUN` | `false` (optional; default `false`) |
| `MIN_AGE_HOURS` | `48` (optional) |

4. Deploy; logs should show `HTTP 200` and JSON with `scanned` / `deleted` counts.
