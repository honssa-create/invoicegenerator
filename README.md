# InvoiceFlow

A QuickBooks-like financial dashboard with multi-user authentication. Each user gets their own secure account with isolated customers, invoices, and expenses.

## Features

- **Multi-user authentication** — First user bootstraps as admin via `/register`; further accounts are created by an admin under Administration → Users. Data is fully isolated per user / org owner
- **Customer management** — Add, edit, and delete clients with contact details
- **Invoice creation** — Line items, tax calculations, notes, and terms
- **Invoice statuses** — Draft, Sent, Paid, Overdue
- **Expense tracking (支出紀錄)** — Record expenses with expense reason (支出原因), merchant, HKD & RMB amounts, paid date, order no., funding source / payment channel, shopping platform (消費平台), notes, and payment status
- **Batch import (匯入 CSV/Excel)** — Drag-and-drop a `.csv`, `.xlsx`, or `.xls` file; columns map by Chinese/English headers (Date/日期, Payment/支付方式, Reason/支出原因, Platform/消費平台, Amount/金額, Supplier/供應商). Duplicates (same date+amount+supplier) are skipped and new options are auto-added; a toast summarizes imported vs skipped
- **Custom dropdown options (自行增加選項)** — Payment method, expense reason, and platform are tag-style dropdowns with built-in defaults; type a new value and "+ Add" it to persist it for future use
- **Expense ID + Receipt No.** — Each expense gets a global upload-order **Expense ID** (`EXP-0000001`, …) plus a **Receipt No.** `EXP-{paid_YYYYMM}-{FundingSourceCode}{serial}` (e.g. `EXP-202604-CCS001`; codes: CCS, CCC, AB, PB, CS). Serial increments per paid-date month + funding source
- **Global filters & sorting** — Both the Expense and Invoice tables have a filter bar (date range, category/status/client, keyword search, Clear Filters) and sortable Date / Number / Amount columns; default sort is by date descending
- **Order management (訂單管理)** — ClickUp-style order detail page: a two-pane layout with editable header/status/notes, client & shipping info, a design-proof image grid, a full custom-field list, and a live Activity feed with a comment composer
- **Kitchen scheduling & two-tier inventory (智能廚房排程)** — Daily-order stock routing (auto-deduct or 無現貨 backlog), manual large-batch brewing with a live 大字報 raw-material calculator, and a two-tier inventory (finished goods + raw materials with Available = Total − Allocated); completing a batch restocks finished goods and auto-fulfils backlog orders
- **Payment receipts + Accounting reconciliation (會計入帳一覽表)** — Upload a payment receipt on an order; AI (Gemini/OCR) extracts date, amount, bank/platform, method, and reference; a central Accounting dashboard aggregates all order payments with receipt thumbnails and one-click "Confirm Entry" verification
- **Cash Flow & Reconciliation (營運收支中央看板)** — Monthly Product Sales / Other Income / Gross Revenue cards, an "Add Income" modal (category, date, amount, account, remarks, compressed voucher upload), and a unified ledger of all revenue (Product Sale vs Other Income badges) with receipt thumbnails and Pending/Verified toggles
- **Quotations (報價單)** — Quotation dashboard + detail with line items; Generate PDF, Export to Excel, convert to Order, or copy to Invoice (carries line items + client)
- **Invoice ↔ Order linkage** — Link an invoice to its order; the order shows a live payment badge (green Paid / red Unpaid) derived from the linked invoice, and each page cross-links to the other
- **Automated 30-day payment reminders** — A daily-runnable job emails clients whose invoices are unpaid after 30 days and logs a `[System]` entry into the invoice's and linked order's activity feed
- **Unified activity logs** — Orders, Invoices, and Quotations share one `activity_logs` table and ClickUp-style ActivityFeed sidebars that auto-log creation, status/field changes, exports, and system events, plus free-text comments
- **Inbound shipment tracker (到件紀錄)** — Snap a courier waybill label; **PaddleOCR** (when `PADDLE_OCR_URL` is set) extracts waybill / sender / addresses via SF 寄·收 region heuristics, else Gemini, else on-device OCR. Defaults arrival date to today; cargo photos are auto-compressed in the browser (max **1600px**, &lt;300KB JPEG) before upload
- **Scan to Table (掃描成表格)** — Upload an image or PDF of any printed table and extract it into an editable grid (Google Gemini vision when `GEMINI_API_KEY` is set, otherwise on-device OCR), then export it
- **Receipt scanning (收據掃描)** — Upload one or more receipt images; the first is auto-scanned to extract merchant, date, and total (AI vision when `OPENAI_API_KEY` is set, otherwise on-device OCR); blanks are left for manual entry
- **Multiple receipts per expense (多檔案上傳)** — Attach several receipt images; the table shows up to 3 thumbnails (2 + a `+N` badge when more), and a gallery modal shows all images with the receipt number
- **Receipt preview & print (收據預覽與勾選列印)** — Click a thumbnail to open the gallery; select multiple expenses and open a print view where each receipt image is headed by its receipt number
- **Export to Excel (匯出至 Excel)** — Download invoices or expenses as a SheetJS `.xlsx` file
- **Dashboard** — Revenue, pending amounts, expense totals (HKD/RMB), net, and recent invoices
- **Print / PDF** — Professional print-ready invoice view (use browser Print → Save as PDF)

## Tech Stack

- **Next.js 14** (App Router)
- **PostgreSQL** via `pg` (`DATABASE_URL`)
- **JWT** session cookies with bcrypt password hashing
- **Tailwind CSS**

## Getting Started

```bash
npm install
npm run db:up          # starts local Postgres (Docker Compose)
# create .env.local with DATABASE_URL=postgresql://invoiceflow:invoiceflow@127.0.0.1:5432/invoiceflow
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Demo Flow

1. Register the first account (becomes admin). Later users are created under Administration → Users
2. Add customers and create invoices / expenses
3. Data is scoped per user / org owner

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required) | _(required)_ |
| `JWT_SECRET` | Secret for signing session tokens | dev default (change in production) |
| `OPENAI_API_KEY` | Enables AI vision receipt extraction; falls back to on-device OCR when unset | _(unset)_ |
| `OPENAI_VISION_MODEL` | Vision model used when `OPENAI_API_KEY` is set | `gpt-4o-mini` |
| `OCR_LANGS` | tesseract.js OCR languages (e.g. `eng+chi_tra+chi_sim`) | `eng+chi_sim` |
| `PADDLE_OCR_URL` | Base URL of the PaddleOCR sidecar for inbound waybills and rental meter dial OCR | _(unset — skip Paddle)_ |
| `PADDLE_OCR_SECRET` | Optional shared secret; sent as `X-Paddle-OCR-Secret` (set the same value on the sidecar) | _(unset)_ |
| `GEMINI_API_KEY` | Enables Google Gemini vision for Scan-to-Table / inbound fallback / payments (and PDF parsing); falls back to on-device OCR when unset | _(unset)_ |
| `GEMINI_MODEL` | Gemini model used when `GEMINI_API_KEY` is set | `gemini-2.5-flash` |
| `RESEND_API_KEY` | Legacy fallback: fills Honour Resend API key when Settings / `RESEND_API_KEY_HONOUR` unset | _(unset)_ |
| `REMINDER_FROM_EMAIL` | Legacy fallback: fills Honour from address when Settings / `RESEND_FROM_EMAIL_HONOUR` unset | `InvoiceFlow <onboarding@resend.dev>` |
| `RESEND_API_KEY_HONOUR` / `RESEND_FROM_EMAIL_HONOUR` | Optional env overlay for Honour Resend (prefer Settings → Integrations → Resend) | _(unset)_ |
| `RESEND_API_KEY_NESTIEE` / `RESEND_FROM_EMAIL_NESTIEE` | Optional env overlay for Nestiee Resend | _(unset)_ |
| `RESEND_API_KEY_CUPMOKA` / `RESEND_FROM_EMAIL_CUPMOKA` | Optional env overlay for Cupmoka Resend | _(unset)_ |
| `REMINDER_DAYS` | Age (days) after which an unpaid invoice triggers a reminder | `30` |
| `CRON_SECRET` | Bearer token for external schedulers: `/api/cron/payment-reminders`, `/api/cron/hub-sync`, and other `/api/cron/*` routes | _(unset)_ |
| `HUB_OWNER_USER_ID` | User id whose WooCommerce / QuickBooks / ClickUp integration settings cron hub-sync uses (defaults to first admin) | _(unset)_ |
| `WOO_HTTP_USER_AGENT` | User-Agent for server-side Woo API calls. SiteGround WAF 403s incomplete/old UAs; default is a full Chrome 140 string | _(unset)_ |
| `RECEIPTS_DIR` | Local/volume receipt image folder (use `/data/receipts` on Railway with a volume) | `data/receipts` |
| `R2_ENDPOINT` | Cloudflare R2 S3 API endpoint | _(unset — local disk fallback)_ |
| `R2_ACCESS_KEY_ID` | R2 access key | _(unset)_ |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | _(unset)_ |
| `R2_BUCKET_NAME` | R2 bucket name | _(unset)_ |
| `R2_PUBLIC_URL` | Public base URL for R2 objects (e.g. `https://pub-xxx.r2.dev`) | _(unset)_ |

One-time SQLite → Postgres import (devDependency `better-sqlite3` only):  
`DATABASE_URL=… SQLITE_PATH=/path/to/invoices.db npm run db:migrate-sqlite`

## Production

```bash
npm run build
npm start
```

Set `JWT_SECRET` and `DATABASE_URL` in production.

## Deploy on Railway

1. **Connect the correct repo & branch**
   - Repository: `honssa-create/invoicegenerator`
   - Branch: **`main`** (must not be an empty feature branch)
   - Root Directory: leave **empty** (repo root contains `package.json`)

2. **Attach Railway Postgres** and set `DATABASE_URL` from the plugin

3. **Receipt image storage (pick one — required for production)**

   **Option A — Cloudflare R2 (recommended)**  
   Survives redeploys even without a volume. New uploads store a public `https://…` URL in the database.
   - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`

   **Option B — Railway volume for receipts**  
   Mount path e.g. `/data`, set `RECEIPTS_DIR=/data/receipts`.  
   ⚠️ Without R2 or a volume, redeploy wipes container-local images while DB rows remain. On ephemeral production storage, imported remote receipt links keep the URL as `path` instead of saving to disk.

4. **Required environment variables**
   - `DATABASE_URL` — Postgres connection string
   - `JWT_SECRET` — session signing secret

5. **Optional — PaddleOCR second service** (better inbound waybill OCR without cloud AI)
   - **+ New** service from the same GitHub repo
   - Root Directory: `services/paddle-ocr` (uses that folder’s Dockerfile)
   - Allocate ≥2GB RAM; private networking is enough
   - On the Next.js service set `PADDLE_OCR_URL=http://<paddle-service-name>.railway.internal:8000`
   - Details: [`services/paddle-ocr/README.md`](services/paddle-ocr/README.md)

6. **Redeploy** after pushing to `main` (Settings → Deploy → Redeploy)

This repo includes `railpack.json` and `railway.json` so Railpack detects **Node.js / Next.js** and runs `npm run build` + `npm start` automatically.

## Order Hub auto-sync

Incremental WooCommerce, QuickBooks (if connected), and ClickUp (if API token + List ID are set) import runs via `GET|POST /api/cron/hub-sync` with `Authorization: Bearer $CRON_SECRET`. The app pulls from the store using Railway’s **static outbound IPv4** addresses — allowlist **all** of them on the webstore host / CDN / WAF if API access is IP-restricted.

**Railway cron services** (recommended — see [`services/cron-hub-sync/`](services/cron-hub-sync/README.md), [`services/cron-orphan-receipt-sweep/`](services/cron-orphan-receipt-sweep/README.md), [`services/cron-rental-invoices/`](services/cron-rental-invoices/README.md))

1. On each cron service, set **Root Directory** to the matching `services/cron-*` folder and redeploy.
2. **Cron Schedule** in Settings: hub-sync `*/15 * * * *`; orphan receipts `0 19 * * *`; rental `15 16 * * *` (all UTC).
3. Variables on each cron service: `CRON_SECRET` (same as main app) and `APP_URL` (e.g. `https://${{invoice-generator.RAILWAY_PUBLIC_DOMAIN}}`).
4. Orphan sweep path is **`/api/cron/orphan-receipts`** — not `orphan-receipt-sweep` (404 if wrong).

**Railway (main app)**
1. Set `CRON_SECRET` (and optional `HUB_OWNER_USER_ID`).
2. Configure each store under **Settings → API Integrations**, or set `WOOCOMMERCE_{NESTIEE|HONOUR|CUPMOKA}_{URL,KEY,SECRET}`.

**GitHub Actions** (optional backup — workflow [`.github/workflows/hub-sync-cron.yml`](.github/workflows/hub-sync-cron.yml) — every 15 minutes + manual dispatch)
1. Repo → Settings → Secrets and variables → Actions: add `APP_URL` (e.g. `https://your-app.up.railway.app`, no trailing slash required) and `CRON_SECRET` (same value as Railway).
2. Actions → **Hub sync cron** → Run workflow once; confirm Order Hub “Last import” updates.
