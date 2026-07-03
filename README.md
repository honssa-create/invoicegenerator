# InvoiceFlow

A QuickBooks-like invoice generator with multi-user authentication. Each user gets their own secure account with isolated customers and invoices.

## Features

- **Multi-user authentication** — Register and sign in with separate accounts; data is fully isolated per user
- **Customer management** — Add, edit, and delete clients with contact details
- **Invoice creation** — Line items, tax calculations, notes, and terms
- **Invoice statuses** — Draft, Sent, Paid, Overdue
- **Dashboard** — Revenue, pending amounts, and recent invoice overview
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

## Production

```bash
npm run build
npm start
```

Set `JWT_SECRET` to a strong random string in production.
