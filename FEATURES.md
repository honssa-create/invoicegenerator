# InvoiceFlow — Current Version Features (v1.0.0)

InvoiceFlow is a single Next.js 14 app with SQLite storage. Each registered user gets a fully isolated workspace for customers, sales documents, orders, expenses, and operations tooling.

---

## Platform & Security

| Feature | Description |
|---------|-------------|
| **Multi-user authentication** | Register / sign in with email + password. JWT session cookies (`jose`) and bcrypt password hashing. |
| **Per-user data isolation** | Every API route scopes queries by authenticated `user_id`. Users cannot see each other's records. |
| **Local SQLite database** | `data/invoices.db` (WAL mode). Schema auto-created on first run; no separate migration step. |
| **Environment-based AI** | OpenAI vision, Google Gemini, and Resend email are optional — features degrade gracefully to on-device OCR or activity-log-only reminders when keys are unset. |

---

## Dashboard (`/dashboard`)

- **Revenue overview** — Total revenue, pending amount, invoice count, overdue count.
- **Expense summary** — Expense count plus HKD and RMB totals.
- **Recent invoices** — Quick-access list with status badges.
- **Quick action** — One-click link to create a new invoice.

---

## Customers (`/customers`)

- Add, edit, and delete client records (name, email, phone, address, notes).
- Customers are referenced when creating invoices, quotations, and orders.

---

## Invoices (`/invoices`)

| Feature | Description |
|---------|-------------|
| **Line-item invoices** | Multiple items with quantity, rate, amount; subtotal, tax rate, tax amount, total. |
| **Statuses** | Draft, Sent, Paid, Overdue. |
| **Notes & terms** | Free-text notes and payment terms on each invoice. |
| **Global filters & sorting** | Date range, status, client, keyword search; sortable Date / Number / Amount columns (default: date descending). |
| **Print / PDF** | Print-ready view at `/invoices/[id]/print` (browser Print → Save as PDF). |
| **Export to Excel** | `GET /api/invoices/export` streams a SheetJS `.xlsx`. |
| **Linked order** | Optional `order_id` FK; invoice detail has a Linked Order selector. Status changes and linking are logged to both records' activity feeds. |
| **30-day payment reminders** | Cron endpoint (`/api/cron/payment-reminders`) flags unpaid invoices ≥ 30 days old, emails the linked order/customer address (Resend when configured), and logs `[System]` activity. Manual trigger available on the Invoices page. |

---

## Quotations (`/quotations`)

| Feature | Description |
|---------|-------------|
| **Quotation dashboard & detail** | Mirrors invoice structure with editable line items. |
| **Print / PDF** | `/quotations/[id]/print` for browser print. |
| **Export to Excel** | `GET /api/quotations/[id]/export`. |
| **Convert to Invoice or Order** | One-click conversion copies line items and client; logs conversion on both sides. |
| **Activity feed** | Same unified activity log as orders and invoices. |

---

## Orders (`/orders`)

ClickUp-style order management for production and fulfillment workflows.

### Layout & autosave

- **Two-pane detail page** — Left (~70%) scrollable content; right (~30%) fixed Activity panel.
- **Autosave** — Text fields save on blur; selects and checkboxes save on change via `PATCH /api/orders/[id]`.
- **Status workflow** — 草稿 → 已到公司 → 圖稿已給客戶 → 已搬到生產中 → 製作中 → 已寄出 SENT.
- **Payment badge** — Derived from linked invoice status (green 全數付清 when paid, red Unpaid/Overdue otherwise).

### Section boxes (dynamic by order type)

Three "Quiet Luxury" section boxes above the legacy fields list:

1. **Order Detail** — Dynamic by `order_type`:
   - `訂製襟章` — Badge style, quantity, image preview.
   - `燕窩回禮燉製` — Bird's-nest dates/quantities/production with reactive formulas (`computeBirdNestTotals`: totals, 燕餅 g, tags, stickers, expiry auto-fill from Big Day + 4 weeks).
2. **Payment Detail** — Payment receipt upload, extracted fields, verification status.
3. **Shipment Detail** — Delivery date, tracking number, shipping address (synced with core `shipping_address` column).

### Design proofs & files

- **Image upload** — Browser-compressed JPEG (max 1600px, target &lt;300KB) via `compressImage`.
- **PDF upload** — Client-side conversion to compressed page images via `compressPdfToImages` (pdfjs-dist); original PDF is never uploaded. Heavy PDFs (&gt;2 MB) use aggressive compression (1400px / quality 0.5).
- **Auth-scoped serving** — `GET /api/order-files/[id]`.

### Payment receipt scanning

- Upload image/PDF on the order; compressed client-side (1600px, quality 0.65, &lt;300KB).
- `POST /api/payments/scan` extracts payment date, amount, bank/platform, method, reference via Gemini (OCR fallback).
- Receipt served at `GET /api/orders/[id]/payment-receipt`; `payment_verified` toggle for accounting.

### Delivery notes (出貨單)

- **Carton count** — `carton_count` column surfaced in the fields list.
- **Print-ready delivery note** — `/orders/[id]/delivery-note` shows ship-to address, phone, PO#, product description, quantity, and prominent carton count. Generating logs an activity entry.

### Custom fields

- 30+ configurable fields (supplier info, plating, craft, tracking, shipping method, etc.) stored in `fields_json` or first-class columns.

---

## Inbound Shipment Tracker (`/inbound`)

| Feature | Description |
|---------|-------------|
| **Waybill scan** | Upload courier label photo; Gemini vision (tesseract + regex fallback) extracts waybill number and sender. |
| **Editable form** | Pre-filled fields; arrival date defaults to today; fully editable before save. |
| **Photo storage** | Compressed in browser (1600px, &lt;300KB JPEG); served auth-scoped at `GET /api/inbound-files/[id]`. |

---

## Kitchen Scheduling (`/kitchen`)

Two-tier inventory and production scheduling for bird's-nest products.

| Pillar | Behavior |
|--------|----------|
| **Order routing** | `createDailyOrder`: if finished-bottle stock ≥ qty → deduct + status Ready to Ship; else 無現貨 (Out of Stock) backlog. |
| **Manual batch brewing** | `createBatch` allocates raw materials; `completeBatch` consumes raw, adds finished, FIFO-fulfils backlog for that SKU. |
| **Raw material calculator** | Live 大字報 from batch bottle count (燕餅 = bottles × 0.8g, etc.). |
| **Two-tier inventory** | `kitchen_finished` (ready-to-ship) + `kitchen_raw` (total − allocated = available). Seeded per user on first state load. |

APIs return fresh full `state` after each mutation so the dashboard stays in sync.

---

## Expenses (`/expenses`)

| Feature | Description |
|---------|-------------|
| **Expense records (支出紀錄)** | Expense reason, merchant, HKD & RMB amounts, paid date, order no., payment method, platform, notes, payment status. |
| **Smart receipt numbers** | `EXP-YYYYMM-XXX` — month from expense date (`paid_date`), per-month serial via `MAX(serial)+1`. |
| **Receipt scanning** | Upload images; first auto-scanned for merchant/date/total (OpenAI vision or tesseract.js OCR). |
| **Multiple receipts** | Several images per expense; table shows up to 3 thumbnails (+N badge); gallery modal with receipt number. |
| **Custom dropdown options** | Payment method, expense reason, platform — built-in defaults + user-added tags via `TagSelect`. |
| **Batch import** | CSV/Excel with Chinese/English header aliases; UTF-8 CSV decoding; duplicate skip (date+amount+supplier); auto tag-sync for new options. |
| **Global filters & sorting** | Same `FilterBar` pattern as invoices. |
| **Receipt print view** | `/expenses/print?ids=1,2,3` — selected receipts with receipt-number headers; print-color-adjust for headers. |
| **Export to Excel** | `GET /api/expenses/export` via SheetJS. |

---

## Accounting (`/accounting`)

- **Central reconciliation table** — Aggregates every order with any payment field.
- **Columns** — Receipt thumbnail, order #, customer, type, date, amount, bank, method, reference, verified status.
- **Confirm Entry** — One-click toggle of `payment_verified` (Pending ↔ Verified).

---

## Cash Flow (`/cashflow`)

| Feature | Description |
|---------|-------------|
| **Monthly cards** | Product Sales, Other Income, Gross Revenue for selected month. |
| **Unified ledger** | Product Sale rows from order `payment_amount`; Other Income from `other_income` table. |
| **Add Income modal** | Category, date, amount, account, remarks; voucher uploaded compressed (1600px, quality 0.65, &lt;300KB). |
| **Verification** | Product rows via order `payment_verified`; manual income via `PATCH /api/other-income/[id]`. |

---

## Scan to Table (`/scan-table`)

- Upload image or PDF of any printed table.
- **Gemini vision** when `GEMINI_API_KEY` is set (PDF requires key); otherwise on-device OCR for images.
- Returns editable 2D grid; client-side SheetJS export.

---

## Unified Activity Log

- Shared `activity_logs` table for Orders, Invoices, and Quotations (`entity_type` + `entity_id`).
- **Auto-logged events** — Creation, status/field changes, exports, delivery-note generation, conversions, reminders.
- **Comments** — Free-text via `ActivityFeed` component and `POST /api/activities`.
- **System author** — Automated events appear as `[System]`.

---

## Navigation modules

| Route | Module |
|-------|--------|
| `/dashboard` | Dashboard |
| `/quotations` | Quotations |
| `/invoices` | Invoices |
| `/orders` | Orders |
| `/inbound` | Inbound shipments |
| `/kitchen` | Kitchen scheduling |
| `/expenses` | Expenses |
| `/accounting` | Accounting reconciliation |
| `/cashflow` | Cash flow |
| `/scan-table` | Scan to table |
| `/customers` | Customers |

---

## Tech stack

- **Next.js 14** (App Router), **React 18**, **TypeScript**
- **SQLite** via `better-sqlite3`
- **Tailwind CSS**
- **SheetJS (`xlsx`)** — spreadsheet import/export
- **tesseract.js** — on-device OCR fallback
- **pdfjs-dist** — client-side PDF → image conversion
- **exceljs** — listed as external package (legacy; exports now use SheetJS)

---

## Optional environment variables

See [README.md](./README.md#environment-variables) for `JWT_SECRET`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, and related settings.
