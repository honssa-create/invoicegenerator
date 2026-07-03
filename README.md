# InvoiceFlow

A QuickBooks-like financial dashboard with multi-user authentication. Each user gets their own secure account with isolated customers, invoices, and expenses.

## Features

- **Multi-user authentication** — Register and sign in with separate accounts; data is fully isolated per user
- **Customer management** — Add, edit, and delete clients with contact details
- **Invoice creation** — Line items, tax calculations, notes, and terms
- **Invoice statuses** — Draft, Sent, Paid, Overdue
- **Expense tracking (支出紀錄)** — Record expenses by category (ingredients, packaging, marketing, rent, other) with HKD & RMB amounts, paid date, order no., 消費平台, notes, and payment status
- **Auto receipt numbers (自動編號)** — Every expense gets a unique sequential ID (e.g. `EXP-2026-0001`) saved with the record
- **Receipt scanning (收據掃描)** — Upload a receipt image and auto-extract merchant, date, and total (AI vision when `OPENAI_API_KEY` is set, otherwise on-device OCR); blanks are left for manual entry
- **Receipt preview & print (收據預覽與勾選列印)** — Thumbnail per row with click-to-zoom preview; select multiple expenses and open a print view where each receipt image is headed by its receipt number
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

## Production

```bash
npm run build
npm start
```

Set `JWT_SECRET` to a strong random string in production.
