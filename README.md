# InvoiceFlow

A QuickBooks-like financial dashboard with multi-user authentication. Each user gets their own secure account with isolated customers, invoices, and expenses.

## Features

- **Multi-user authentication** — Register and sign in with separate accounts; data is fully isolated per user
- **Customer management** — Add, edit, and delete clients with contact details
- **Invoice creation** — Line items, tax calculations, notes, and terms
- **Invoice statuses** — Draft, Sent, Paid, Overdue
- **Expense tracking (支出紀錄)** — Record expenses with expense reason (支出原因), merchant, HKD & RMB amounts, paid date, order no., payment method (支付方式), shopping platform (消費平台), notes, and payment status
- **Batch import (匯入 CSV/Excel)** — Drag-and-drop a `.csv`, `.xlsx`, or `.xls` file; columns map by Chinese/English headers (Date/日期, Payment/支付方式, Reason/支出原因, Platform/消費平台, Amount/金額, Supplier/供應商). Duplicates (same date+amount+supplier) are skipped and new options are auto-added; a toast summarizes imported vs skipped
- **Custom dropdown options (自行增加選項)** — Payment method, expense reason, and platform are tag-style dropdowns with built-in defaults; type a new value and "+ Add" it to persist it for future use
- **Smart receipt numbers (EXP-YYYYMM-XXX)** — Each expense gets a unique ID whose month comes from the expense date (not the upload date), with a per-month serial that continues correctly for backfilled historical records
- **Global filters & sorting** — Both the Expense and Invoice tables have a filter bar (date range, category/status/client, keyword search, Clear Filters) and sortable Date / Number / Amount columns; default sort is by date descending
- **Order management (訂單管理)** — ClickUp-style order detail page: a two-pane layout with editable header/status/notes, client & shipping info, a design-proof image grid, a full custom-field list, and a live Activity feed with a comment composer
- **Kitchen scheduling & two-tier inventory (智能廚房排程)** — Daily-order stock routing (auto-deduct or 無現貨 backlog), manual large-batch brewing with a live 大字報 raw-material calculator, and a two-tier inventory (finished goods + raw materials with Available = Total − Allocated); completing a batch restocks finished goods and auto-fulfils backlog orders
- **Payment receipts + Accounting reconciliation (會計入帳一覽表)** — Upload a payment receipt on an order; AI (Gemini/OCR) extracts date, amount, bank/platform, method, and reference; a central Accounting dashboard aggregates all order payments with receipt thumbnails and one-click "Confirm Entry" verification
- **Quotations (報價單)** — Quotation dashboard + detail with line items; Generate PDF, Export to Excel, and one-click convert to an Order or Invoice (carries line items + client)
- **Invoice ↔ Order linkage** — Link an invoice to its order; the order shows a live payment badge (green Paid / red Unpaid) derived from the linked invoice, and each page cross-links to the other
- **Automated 30-day payment reminders** — A daily-runnable job emails clients whose invoices are unpaid after 30 days and logs a `[System]` entry into the invoice's and linked order's activity feed
- **Isolated activity logs** — Every Order, Invoice, and Quotation has its own ClickUp-style activity sidebar that auto-logs creation, status/field changes, exports, and system events, plus free-text comments
- **Inbound shipment tracker (到件紀錄)** — Snap a courier waybill label; AI vision (Gemini, OCR fallback) extracts the waybill number and sender, defaults the arrival date to today, and saves the record with the cargo photo. Cargo photos are auto-compressed in the browser (≤1200px, &lt;300KB JPEG) before upload
- **Scan to Table (掃描成表格)** — Upload an image or PDF of any printed table and extract it into an editable grid (Google Gemini vision when `GEMINI_API_KEY` is set, otherwise on-device OCR), then export it
- **Receipt scanning (收據掃描)** — Upload one or more receipt images; the first is auto-scanned to extract merchant, date, and total (AI vision when `OPENAI_API_KEY` is set, otherwise on-device OCR); blanks are left for manual entry
- **Multiple receipts per expense (多檔案上傳)** — Attach several receipt images; the table shows up to 3 thumbnails (2 + a `+N` badge when more), and a gallery modal shows all images with the receipt number
- **Receipt preview & print (收據預覽與勾選列印)** — Click a thumbnail to open the gallery; select multiple expenses and open a print view where each receipt image is headed by its receipt number
- **Export to Excel (匯出至 Excel)** — Download invoices or expenses as a formatted `.xlsx` file
- **Dashboard** — Revenue, pending amounts, expense totals (HKD/RMB), net, and recent invoices
- **Print / PDF** — Professional print-ready invoice view (use browser Print → Save as PDF)

## Tech Stack

- **Next.js 14** (App Router)
- **SQLite** via better-sqlite3
- **JWT** session cookies with bcrypt password hashing
- **Tailwind CSS**

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Demo Flow

1. Register two different accounts (e.g. `alice@company.com` and `bob@company.com`)
2. Each user adds their own customers and creates invoices
3. Data is scoped per user — Alice cannot see Bob's invoices

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret for signing session tokens | dev default (change in production) |
| `OPENAI_API_KEY` | Enables AI vision receipt extraction; falls back to on-device OCR when unset | _(unset)_ |
| `OPENAI_VISION_MODEL` | Vision model used when `OPENAI_API_KEY` is set | `gpt-4o-mini` |
| `OCR_LANGS` | tesseract.js OCR languages (e.g. `eng+chi_tra+chi_sim`) | `eng` |
| `GEMINI_API_KEY` | Enables Google Gemini vision for Scan-to-Table (and PDF parsing); falls back to on-device OCR when unset | _(unset)_ |
| `GEMINI_MODEL` | Gemini model used for Scan-to-Table | `gemini-2.5-flash` |
| `RESEND_API_KEY` | Enables sending real reminder emails via Resend; without it reminders are logged to activity feeds only | _(unset)_ |
| `REMINDER_FROM_EMAIL` | From address for reminder emails | `InvoiceFlow <onboarding@resend.dev>` |
| `REMINDER_DAYS` | Age (days) after which an unpaid invoice triggers a reminder | `30` |
| `CRON_SECRET` | Bearer token that lets an external scheduler run reminders for all users via `/api/cron/payment-reminders` | _(unset)_ |

## Production

```bash
npm run build
npm start
```

Set `JWT_SECRET` to a strong random string in production.
