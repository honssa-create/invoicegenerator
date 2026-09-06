# cron-hub-sync

Railway cron service: triggers InvoiceFlow Order Hub sync every 15 minutes.

## Endpoint

`GET /api/cron/hub-sync` with `Authorization: Bearer $CRON_SECRET`

## Railway setup

1. Service **Root Directory**: `services/cron-hub-sync`
2. **Cron Schedule** (Settings): `*/15 * * * *` (UTC)
3. Variables (on this service):

| Variable | Example |
|----------|---------|
| `CRON_SECRET` | Same value as on `invoice-generator` |
| `APP_URL` | `https://${{invoice-generator.RAILWAY_PUBLIC_DOMAIN}}` |

4. Deploy once; check logs for `HTTP 200` and a JSON body with `woocommerce`.
