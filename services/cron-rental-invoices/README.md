# cron-rental-invoices

Railway cron service: materializes rental billing periods and overdue flips (no auto email).

## Endpoint

`POST /api/cron/rental-invoices` with `Authorization: Bearer $CRON_SECRET`

## Railway setup

1. Service **Root Directory**: `services/cron-rental-invoices`
2. **Cron Schedule** (Settings): `15 16 * * *` (daily 16:15 UTC = 00:15 HKT)
3. Variables:

| Variable | Example |
|----------|---------|
| `CRON_SECRET` | Same value as on `invoice-generator` |
| `APP_URL` | `https://${{invoice-generator.RAILWAY_PUBLIC_DOMAIN}}` |
