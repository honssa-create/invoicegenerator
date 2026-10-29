# cron-hub-sync

Railway cron service: triggers InvoiceFlow Order Hub sync every 15 minutes.

## Endpoint

`GET /api/cron/hub-sync` with `Authorization: Bearer $CRON_SECRET`

The same run then calls `GET /api/cron/payment-ledger` (入帳紀錄). That job reads ClickUp task comments, which Order Hub sync does not. It uses the ClickUp API token from Settings → Integrations (or `CLICKUP_API_TOKEN`). The list defaults to Nestiee 婚宴回禮 `901812202272`; set `CLICKUP_PAYMENT_LIST_ID` only to point at a different list. No new secret is required for this cron when the token is already configured.

Comment and payment-field edits can also arrive immediately at `POST /api/webhooks/clickup`. That route needs **`CLICKUP_WEBHOOK_SECRET`** on the app service (the `webhook.secret` from ClickUp’s Create Webhook response). The cron service does not need that variable. The cron walk remains the backfill when a webhook is missed. Setup steps are on Settings → API Integrations → ClickUp.

## Railway setup

1. Service **Root Directory**: `services/cron-hub-sync`
2. **Cron Schedule** (Settings): `*/15 * * * *` (UTC)
3. Variables (on this service):

| Variable | Example |
|----------|---------|
| `CRON_SECRET` | Same value as on `invoice-generator` |
| `APP_URL` | `https://${{invoice-generator.RAILWAY_PUBLIC_DOMAIN}}` |

4. Deploy once; check logs for `HTTP 200` and a JSON body with `woocommerce`.

## Performance notes

Incremental cron sync:

- **Modified orders** — re-fetched every run (7-day overlap), newest modified first.
- **Nestiee recent created (7 days)** — merged every run so new `processing` orders are not missed.
- **Nestiee 90-day created catch-up** — at most once per 24h (`HUB_WOO_CATCHUP_INTERVAL_HOURS`), and only non-completed Woo statuses.
- **Settled orders** — `shipped` / `completed` (etc.) already in Hub are skipped when status unchanged.
- **on-hold** — stored as `on-hold` in Hub (not mapped to `processing`).

## WooCommerce webhooks (instant new-order sync)

Configure in **WooCommerce → Settings → Advanced → Webhooks** (per store):

| Field | Value |
|-------|--------|
| Delivery URL | `https://<your-app>/api/webhooks/woocommerce/nestiee` (or `honour`, `cupmoka`, …) |
| Secret | Same string as Railway env `WOO_WEBHOOK_SECRET_NESTIEE` (or global `WOO_WEBHOOK_SECRET`) |
| Topic | **Order created** and **Order updated** (create two webhooks, or one per topic) |

Order Hub also has **Sync now (server)** for manual incremental pull without a date range.

Optional on `invoice-generator`: `HUB_WOO_CATCHUP_INTERVAL_HOURS=24` (default).
