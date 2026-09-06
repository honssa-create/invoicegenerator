/**
 * Generates docs/InvoiceFlow-Technical-Onboarding.docx
 * Run: npm run docs:onboarding
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  Header,
  Footer,
  PageNumber,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'InvoiceFlow-Technical-Onboarding.docx');

const PAGE_WIDTH = 12240;
const MARGIN = 720;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        italics: opts.italics,
        size: opts.size ?? 22,
      }),
    ],
  });
}

function rich(...runs) {
  return new Paragraph({
    spacing: { after: 120 },
    children: runs.map((r) =>
      typeof r === 'string'
        ? new TextRun({ text: r, size: 22 })
        : new TextRun({ size: 22, ...r }),
    ),
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'numbers', level },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function codeLine(text) {
  return new Paragraph({
    spacing: { after: 40 },
    style: 'Code',
    children: [
      new TextRun({
        text,
        font: 'Courier New',
        size: 18,
      }),
    ],
  });
}

function headerTable(headers, rows, colWidths) {
  const widths =
    colWidths ??
    headers.map(() => Math.floor(CONTENT_WIDTH / headers.length));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: headers.map(
          (h, i) =>
            new TableCell({
              width: { size: widths[i], type: WidthType.DXA },
              shading: { fill: '1E3A5F' },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '1E3A5F' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: '1E3A5F' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '1E3A5F' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '1E3A5F' },
              },
              children: [
                new Paragraph({
                  spacing: { after: 40, before: 40 },
                  children: [
                    new TextRun({
                      text: String(h),
                      bold: true,
                      color: 'FFFFFF',
                      size: 18,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
      ...rows.map(
        (row, ri) =>
          new TableRow({
            children: row.map(
              (c, i) =>
                new TableCell({
                  width: { size: widths[i], type: WidthType.DXA },
                  shading: ri % 2 === 0 ? { fill: 'F8FAFC' } : undefined,
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                  },
                  children: [
                    new Paragraph({
                      spacing: { after: 40, before: 40 },
                      children: [
                        new TextRun({ text: String(c), size: 17 }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
      ),
    ],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

function buildChildren() {
  const children = [];

  // Title page
  children.push(
    new Paragraph({
      spacing: { before: 1200, after: 200 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'InvoiceFlow',
          bold: true,
          size: 56,
          color: '1E3A5F',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 400 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Internal Technical Onboarding Guide',
          size: 32,
          color: '334155',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'For new developers joining the codebase',
          italics: true,
          size: 22,
          color: '64748B',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `Generated ${new Date().toISOString().slice(0, 10)}`,
          size: 20,
          color: '94A3B8',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: 'Regenerate with: npm run docs:onboarding',
          size: 18,
          color: '94A3B8',
          font: 'Courier New',
        }),
      ],
    }),
  );

  // TOC-style overview
  children.push(
    h1('Document Contents'),
    bullet('1. Introduction'),
    bullet('2. Tech Stack & Repository Map'),
    bullet('3. Local Setup'),
    bullet('4. Architecture'),
    bullet('5. Auth, RBAC & Org Data Scoping'),
    bullet('6. Data Model (by Domain)'),
    bullet('7. Module Encyclopedia'),
    bullet('8. End-to-End Flows'),
    bullet('9. Shared Engineering Conventions'),
    bullet('10. Deploy & Operations'),
    bullet('11. Appendix'),
    spacer(),
  );

  // ─── 1. Introduction ───────────────────────────────────────────
  children.push(
    h1('1. Introduction'),
    p(
      'InvoiceFlow is a single Next.js 14 (App Router) monolith that powers operations and finance workflows for Honour, Nestiee, and Cupmoka brands. It covers customers, quotations, orders, invoices, expenses, cashflow, bank reconciliation, rentals, kitchen inventory/prep, company stocks, inbound shipments, and integrations (WooCommerce including Honour EN, QuickBooks, ClickUp, Resend, Yedpay, SF Express).',
    ),
    p(
      'This document is the internal technical onboarding guide. It explains how the system is structured, how requests flow from UI to database, how data is scoped per organization, and how each major module works. Day-to-day Markdown references remain README.md (setup/ops) and AGENTS.md (module conventions for agents and developers).',
    ),
    h2('1.1 Who this is for'),
    bullet('Engineers joining the InvoiceFlow codebase'),
    bullet('Anyone tracing a bug across UI → API → lib → Postgres'),
    bullet('Anyone adding a new feature that must follow existing auth, org, and client/server split patterns'),
    h2('1.2 Suggested first-week reading path'),
    numbered('Get local Postgres + .env.local running (Section 3).'),
    numbered('Read auth + org scoping (Section 5) — every API route depends on this. Note kitchen uses a company-wide owner, not the session org owner.'),
    numbered(
      'Trace one vertical slice end-to-end: e.g. src/app/invoices/page.tsx → GET /api/invoices → src/lib/invoices.ts → db.prepare.',
    ),
    numbered('Skim Orders (largest module): src/lib/orders.ts + order-server.ts + Hub import.'),
    numbered('Read activity logging (src/lib/activity.ts) and one conversion flow in Section 8.'),
    numbered('Keep src/lib/pg-schema.sql open as the data-model source of truth.'),
  );

  // ─── 2. Tech stack ─────────────────────────────────────────────
  children.push(
    h1('2. Tech Stack & Repository Map'),
    h2('2.1 Stack'),
    headerTable(
      ['Layer', 'Choice'],
      [
        ['Runtime', 'Node.js ≥ 20'],
        ['Framework', 'Next.js 14.2.x (App Router), React 18'],
        ['Language', 'TypeScript 5.7 (strict)'],
        ['Database', 'PostgreSQL 16 via pg — no Prisma / no ORM'],
        ['Auth', 'jose (JWT HS256) + bcryptjs'],
        ['Styling', 'Tailwind CSS 3.4'],
        ['Testing', 'Vitest 2.x'],
        ['Spreadsheets', 'xlsx (SheetJS) for export/import; exceljs for XLSX image extract only'],
        ['OCR / AI', 'tesseract.js; optional OpenAI, Gemini, PaddleOCR sidecar'],
        ['PDF (client)', 'pdfjs-dist (PDF → compressed page images)'],
        ['Storage', 'Local disk (data/receipts) or Cloudflare R2'],
        ['Email', 'Resend (per-brand keys in Settings → Integrations)'],
      ],
      [2800, 7000],
    ),
    spacer(),
    p(
      'Heavy native/server packages are listed in next.config.js → serverComponentsExternalPackages (pg, tesseract.js, exceljs, xlsx, @aws-sdk/client-s3, jszip). Keep them there.',
    ),
    h2('2.2 Top-level layout'),
    headerTable(
      ['Path', 'Purpose'],
      [
        ['src/', 'Application source'],
        ['src/app/', 'App Router pages + API route handlers'],
        ['src/components/', 'Shared React UI (client components)'],
        ['src/lib/', 'Business logic, DB, auth, integrations'],
        ['src/middleware.ts', 'Edge JWT + RBAC gate'],
        ['public/', 'Static assets and HTML print templates'],
        ['data/receipts/', 'Local receipt storage (gitignored)'],
        ['scripts/', 'One-off DB / docs scripts'],
        ['services/paddle-ocr/', 'Optional FastAPI OCR sidecar'],
        ['.github/workflows/', 'CI (e.g. hub-sync cron)'],
        ['docker-compose.yml', 'Local Postgres 16'],
        ['README.md / AGENTS.md', 'Ops + deep module notes'],
      ],
      [3600, 6200],
    ),
    spacer(),
    h2('2.3 Critical naming convention'),
    rich(
      { text: 'Client-safe modules ', bold: true },
      '(e.g. orders.ts, expenses.ts, kitchen.ts) may be imported by client components. They hold types, constants, pure formulas, and labels only.',
    ),
    rich(
      { text: 'Server-only modules ', bold: true },
      '(e.g. order-server.ts, expense-server.ts, kitchen-server.ts) touch the database. Never import them into client components — it will pull Node/DB code into the browser bundle.',
    ),
    p('Path alias: @/* → src/* (tsconfig.json).'),
  );

  // ─── 3. Local setup ────────────────────────────────────────────
  children.push(
    h1('3. Local Setup'),
    h2('3.1 Prerequisites'),
    bullet('Node.js ≥ 20'),
    bullet('Docker (for local Postgres via docker compose)'),
    h2('3.2 First run'),
    codeLine('npm install'),
    codeLine('npm run db:up'),
    codeLine('# create .env.local with:'),
    codeLine('DATABASE_URL=postgresql://invoiceflow:invoiceflow@127.0.0.1:5432/invoiceflow'),
    codeLine('npm run dev'),
    p('Open http://localhost:3000. Register the first account — it becomes admin with its own data pool. Later users are created under Administration → Users.'),
    h2('3.3 Useful scripts'),
    headerTable(
      ['Script', 'Purpose'],
      [
        ['npm run dev', 'Next.js dev server'],
        ['npm run dev:clean', 'Kill stale Next, wipe .next, restart (use if pages 500 / asset 404)'],
        ['npm run build', 'Production build + TypeScript check'],
        ['npm start', 'Run production build'],
        ['npm test', 'Vitest (needs DATABASE_URL)'],
        ['npm run db:up / db:down', 'Start/stop local Postgres'],
        ['npm run docs:onboarding', 'Regenerate this Word document'],
        ['npm run lint', 'Not configured — do not rely on it'],
      ],
      [3600, 6200],
    ),
    spacer(),
    h2('3.4 Environment variables'),
    headerTable(
      ['Variable', 'Required?', 'Notes'],
      [
        ['DATABASE_URL', 'Yes', 'Postgres connection string'],
        ['JWT_SECRET', 'Prod', 'Dev has a fallback; set in production'],
        ['RECEIPTS_DIR', 'Prod recommended', 'Default data/receipts; use volume path on Railway'],
        ['R2_*', 'Optional', 'Cloudflare R2 for durable receipt storage'],
        ['CRON_SECRET', 'Optional', 'Bearer auth for /api/cron/*'],
        ['HUB_OWNER_USER_ID', 'Optional', 'User whose integrations hub-sync uses'],
        ['KITCHEN_OWNER_USER_ID', 'Optional', 'Shared kitchen/prep inventory owner; falls back to HUB_OWNER_USER_ID then first admin'],
        ['OPENAI_API_KEY', 'Optional', 'Receipt vision; else tesseract'],
        ['GEMINI_API_KEY', 'Optional', 'Scan-to-table / inbound / payments'],
        ['PADDLE_OCR_URL', 'Optional', 'PaddleOCR sidecar base URL'],
        ['PADDLE_OCR_SECRET', 'Optional', 'Shared secret with sidecar'],
        ['OCR_LANGS', 'Optional', 'Default eng+chi_sim'],
        ['REMINDER_DAYS', 'Optional', 'Default 30'],
        ['RESEND_*', 'Optional', 'Prefer Settings → Integrations'],
      ],
      [3200, 1800, 4800],
    ),
    spacer(),
    p(
      'Full env table and Railway deploy notes live in README.md. Schema is not applied during next build; it is applied lazily on first DB access at runtime.',
    ),
  );

  // ─── 4. Architecture ───────────────────────────────────────────
  children.push(
    h1('4. Architecture'),
    h2('4.1 High-level request path'),
    p('Almost all authenticated pages are client components. They wrap AppLayout, fetch /api/* on mount, and often filter/sort client-side (FilterBar). There is no RSC data-fetching pattern for main CRUD.'),
    codeLine('Browser (React page)'),
    codeLine('  → middleware.ts  (JWT verify + section RBAC)'),
    codeLine('  → src/app/api/**/route.ts'),
    codeLine('  → auth.ts (session) + org-server.ts (ownerId)'),
    codeLine('  → src/lib/*-server.ts / domain helpers'),
    codeLine('  → db.ts  (pg, ? → $n placeholders)'),
    codeLine('  → PostgreSQL  (pg-schema.sql)'),
    h2('4.2 Database boot'),
    bullet('There is no separate migration runner.'),
    bullet('Any db.prepare(…).get/all/run calls ensureSchema() in src/lib/db.ts.'),
    bullet('ensureSchema() reads src/lib/pg-schema.sql, runs CREATE TABLE IF NOT EXISTS statements, then runBootDataFixes() (app_migrations, sequence sync, permission seeding).'),
    bullet('During next build, schema boot is skipped (NEXT_PHASE === phase-production-build).'),
    h2('4.3 DB query style'),
    p('The DB layer exposes a better-sqlite3-compatible async API over pg:'),
    codeLine("await db.prepare('SELECT * FROM invoices WHERE user_id = ? AND id = ?').get(ownerId, id);"),
    codeLine("await db.prepare('INSERT INTO ... VALUES (?, ?)').run(a, b);"),
    codeLine('await db.transaction(async () => { /* AsyncLocalStorage tx */ });'),
    bullet('? placeholders auto-convert to $1, $2, …'),
    bullet('adaptSql() handles some SQLite→Postgres dialect differences'),
    bullet('Inserts often auto-append RETURNING id'),
    h2('4.4 Layering'),
    bullet('API route: auth guard, ownerId, thin orchestration'),
    bullet('*-server.ts: DB mutations and complex reads'),
    bullet('*.ts (client-safe): types, formulas, labels'),
    bullet('activity.ts: cross-module audit trail (server-only)'),
  );

  // ─── 5. Auth / RBAC / Org ──────────────────────────────────────
  children.push(
    h1('5. Auth, RBAC & Org Data Scoping'),
    h2('5.1 Session model'),
    p('File: src/lib/auth.ts'),
    bullet('Login verifies bcrypt hash, signs JWT, sets httpOnly cookie invoice_session (7-day expiry).'),
    bullet('SessionPayload: userId, email, name, role, permissions[], ownerUserId.'),
    bullet('Server: getSessionFromRequest(request) or getSession().'),
    bullet('Client: AuthProvider → GET /api/auth/me on mount.'),
    h2('5.2 Roles & permissions'),
    bullet('Roles: admin | operator | accountant (src/lib/permissions.ts).'),
    bullet('Sections include orders, kitchen, kitchen_prep, stocks, rentals, rental_meters (split from rentals), reconciliation, accounting, admin, etc.'),
    bullet('Effective permissions come from role_permissions in Postgres (seeded at boot); JWT carries the resolved list at login.'),
    bullet('Edge enforcement: src/middleware.ts (pages + API except public/cron/auth).'),
    bullet('Route helpers: src/lib/api-guard.ts — requireApiSession, requireApiAdmin, requireApiAccess, denyReadOnlyWrite.'),
    h2('5.3 Org data pooling (not full SaaS multi-tenant)'),
    p('File: src/lib/org-server.ts'),
    bullet('users.owner_user_id links child accounts to an admin (“org owner”).'),
    bullet('Business rows use user_id = data owner id (the admin’s id), not the child user’s id.'),
    bullet('getDataOwnerId(session) resolves ownerUserId from JWT (or DB fallback).'),
    bullet('Almost every query filters WHERE user_id = ? with ownerId.'),
    bullet('Exception: operators see only expenses they created (created_by_user_id) via expenseWhereClause().'),
    bullet('Exception: kitchen inventory + kitchen-prep are company-wide — resolveKitchenOwnerUserId() (KITCHEN_OWNER_USER_ID / HUB_OWNER_USER_ID / first admin), not the session org owner.'),
    h2('5.4 Standard authenticated API pattern'),
    codeLine("const session = await getSessionFromRequest(request);"),
    codeLine("if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });"),
    codeLine("const denied = denyReadOnlyWrite(session, 'customers', request.method);"),
    codeLine('if (denied) return denied;'),
    codeLine('const ownerId = await getDataOwnerId(session);'),
    codeLine("// SELECT/INSERT ... WHERE user_id = ownerId"),
    p('Public paths: /, /login, /register, /api/auth/*, some OAuth callbacks. Cron routes use Authorization: Bearer $CRON_SECRET (or a session for manual single-user runs).'),
  );

  // ─── 6. Data model ─────────────────────────────────────────────
  children.push(
    h1('6. Data Model (by Domain)'),
    p(
      'Canonical schema: src/lib/pg-schema.sql (~50 tables). Applied idempotently on boot. Below is an orientation map — open the SQL file for columns and indexes.',
    ),
    headerTable(
      ['Domain', 'Tables'],
      [
        ['Auth & access', 'users, role_permissions'],
        ['Customers & invoicing', 'customers, invoices, invoice_items, invoice_files'],
        ['Expenses', 'expenses, expense_receipts, expense_options, expense_option_settings, expense_report_sequence'],
        ['Orders & activity', 'orders, order_files, activity_logs'],
        ['Quotations', 'quotations, quotation_items, quotation_files'],
        ['Cash flow', 'other_income'],
        ['Kitchen', 'kitchen_finished, kitchen_raw, kitchen_gift_boxes, kitchen_movements, kitchen_order_fulfillments, kitchen_prep_orders, kitchen_settings (catalog_json / formulas_json)'],
        ['Company stocks', 'stock_items (category/name qty + optional icon_path; distinct from kitchen)'],
        ['Inbound', 'inbound_shipments'],
        ['Rentals', 'rental_tenants, rental_units, rental_records, rental_leases, rental_lease_documents, rental_document_templates, rental_payments, rental_payment_allocations, rental_payment_receipts, rental_charge_items, rental_debit_note_*, rental_activity_logs, utility_meter_rounds, utility_meter_round_items'],
        ['Reconciliation', 'reconciliation_records'],
        ['Integrations', 'integration_tokens, integration_settings, integration_sync_state, hub_order_sequences'],
        ['System', 'global_record_sequences, deleted_records, app_migrations'],
      ],
      [2800, 7000],
    ),
    spacer(),
    h2('6.1 Core sales relationships'),
    bullet('Customer → Quotation / Invoice'),
    bullet('Quotation → convert to Order (orders.quotation_id) or Invoice'),
    bullet('Order ↔ Invoice via invoices.order_id (optional link + convert routes)'),
    bullet('Hub (WooCommerce / QuickBooks) upserts Orders and/or Invoices'),
    bullet('Orders, Invoices, Quotations share unified activity_logs'),
  );

  // ─── 7. Module encyclopedia ────────────────────────────────────
  children.push(
    h1('7. Module Encyclopedia'),
    p('For each module: purpose, main routes, key libraries, tables, and newcomer notes.'),

    h2('7.1 Dashboard'),
    bullet('UI: /dashboard — src/app/dashboard/page.tsx'),
    bullet('API: GET /api/dashboard'),
    bullet('Aggregates invoice counts, paid revenue, pending/overdue, customers, expenses. Uses getDataOwnerId() + list helpers.'),

    h2('7.2 Customers'),
    bullet('UI: /customers'),
    bullet('API: GET/POST /api/customers, GET/DELETE /api/customers/[id]'),
    bullet('Table: customers (simplified contact schema)'),
    bullet('Shared master for invoices (required customer_id) and quotations. Orders auto-sync / upsert customers; pickers can create inline. Names are normalized on Woo import.'),

    h2('7.3 Invoices'),
    bullet('UI: /invoices, /invoices/new, /invoices/[id], print, reminders'),
    bullet('API: /api/invoices, /api/invoices/[id], convert, duplicate, files, export, reminders'),
    bullet('Lib: src/lib/invoices.ts, invoice-print.ts, payment-reminders*.ts'),
    bullet('Tables: invoices, invoice_items, invoice_files'),
    bullet('Statuses: draft → sent → paid / overdue. Optional order_id FK. Linking logs activity on both entities. Order detail derives payment badge from linked invoice status.'),
    bullet('Stored invoice_number is 8 digits; UI prefixes “Invoice ” via displayInvoiceNumber (record-numbering-core.ts). Attachments share the order-style file list + list thumbnails.'),

    h2('7.4 Orders'),
    p('Largest and most integration-heavy module. ClickUp-style detail with custom fields.'),
    bullet('UI: /orders (table/board + Nestiee processing demand cards; bulk status; list filters persist), /orders/[id] (two-pane: lazy-loaded panels + Activity), delivery-note, production-note, /hub'),
    bullet('API: /api/orders, /api/orders/[id], files, payment-receipt, sf-express, convert-to-quotation; Hub routes under /api/hub/*; POST /api/payments/scan'),
    bullet('Lib: orders.ts (ORDER_SHIPPING_METHODS, parsers, bird-nest formulas — client-safe), order-server.ts, kitchen-ship-allocate.ts, hub-server.ts, hub-sync.ts, woocommerce*, delivery-note-print.ts, sf-express*'),
    bullet('Tables: orders (including order_type column), order_files, hub_order_sequences, integration_sync_state'),
    rich(
      { text: 'fields_json: ', bold: true },
      'Most custom fields live in a JSON blob (fields_json). Curated Order/Payment/Shipment boxes and Honour line/supplier cards own the UI; shipping-method options are ORDER_SHIPPING_METHODS.',
    ),
    bullet('Order types drive UI boxes: honour訂製 / honour en訂製 → honour_lines; 燕窩回禮燉製 → bird-nest formulas; Nestiee 燕窩訂單 → nestiee_lines + 所需禮盒 qtys (NESTIEE_GIFT_BOX_TYPES, including 隨心燉 / 花月禮盒 / Trial Set, etc.); Cupmoka has its own ingest/detail lines.'),
    bullet('Payment Detail: three installment slots (payment_*, payment2_*, payment3_*) including receipt paths and payment_verified. Accounting/reconciliation expand one order into up to three rows.'),
    bullet('Design proofs: client-side image/PDF compression before upload to order_files.'),
    bullet('Stored order reference is ORD-#######; UI shows “Order …” via displayOrderNumber.'),
    bullet('First time a Nestiee or 回禮 order is marked shipped, kitchen auto-allocates gift-box / finished stock (kitchen-ship-allocate.ts). Shortage returns kitchen_shortage; user can ship without deducting.'),
    bullet('Hub: Woo nestiee / honour / honour_en / cupmoka → syncWooStore → upsertHubOrder; ClickUp 回禮 tasks when configured; QuickBooks → upsertHubInvoice + matching. Cron every 15 min via GitHub Actions. Woo checkout-drafts skipped for Nestiee/Cupmoka; subdirectory store paths like /en are preserved.'),

    h2('7.5 Quotations'),
    bullet('UI: /quotations, /quotations/[id], print'),
    bullet('API: CRUD, convert {target:order|invoice}, copy-to-invoice, duplicate, export xlsx, files'),
    bullet('Lib: quotations.ts, quotation-server.ts, quotation-to-invoice-server.ts, order-to-quotation-server.ts'),
    bullet('Tables: quotations, quotation_items, quotation_files'),
    bullet('Convert to order sets orders.quotation_id and quotation status approved. copy-to-invoice leaves quotation status unchanged; convert target:invoice also approves. Conversion is one-time (do not convert the same quotation twice).'),
    bullet('Stored quote_number is 8 digits; UI prefixes “Quotation ”. Attachments match the order-style file list.'),

    h2('7.6 Expenses / receipts / scan'),
    bullet('UI: /expenses, /expenses/print, detail-print'),
    bullet('API: /api/expenses, scan, import, export; /api/receipts/[id]; /api/expense-options'),
    bullet('Lib: expenses.ts (defaults/labels), expense-server.ts (numbering, multi-receipt), receipt.ts'),
    bullet('Tables: expenses, expense_receipts, expense_options, expense_option_settings, expense_report_sequence'),
    bullet('Expense ID (batch_id): EXP-0000001… global serial. Receipt No: EXP-{paid_YYYYMM}-{FundingSourceCode}{serial} (CCS, CCC, AB, PB, CS).'),
    bullet('OCR priority for scan: OpenAI vision (if key) → tesseract.js. Multi-image: expense_receipts; receipt_path kept as primary.'),
    bullet('Import: CSV UTF-8 / XLSX; Chinese/English header aliases; duplicate skip; auto-add expense_options.'),
    bullet('Operators: expenseWhereClause scopes to created_by_user_id.'),

    h2('7.7 Cashflow, Accounting, Reconciliation'),
    h3('Cashflow (/cashflow)'),
    bullet('GET /api/cashflow?month=YYYY-MM — Product Sales from order payment fields + Other Income from other_income.'),
    bullet('Manual income via /api/other-income (+ voucher upload).'),
    h3('Accounting'),
    bullet('GET /api/accounting still serves the ledger (one row per populated installment). Confirm Entry PATCHes fields.payment_verified via PATCH /api/orders/[id].'),
    bullet('Primary UI is /reconciliation?view=accounting (merged dashboard). Standalone /accounting still renders AccountingTable for the accounting permission.'),
    h3('Reconciliation (/reconciliation)'),
    bullet('Bank CSV / Yedpay sync → match/link-payment/approve against orders/invoices (installment-aware). Approve sets payment_verified and logs activity. Incremental Yedpay pagination.'),
    bullet('Lib: reconciliation.ts, reconciliation-server.ts, reconciliation-page-utils.ts, yedpay.ts. Table: reconciliation_records.'),

    h2('7.8 Rentals'),
    bullet('UI: /rentals (master panel + collection grid), /rentals/[id], tenants, meters, templates, print invoice/receipt'),
    bullet('API: /api/rentals, units, records (invoice/paid), payments/allocate, meters, templates, cron/rental-invoices'),
    bullet('Lib: rentals.ts, rental-server.ts, rental-lease-server.ts, rental-ledger-server.ts, meter-ocr.ts'),
    bullet('Flow: unit lease → monthly rental_records (virtual cards until materialized) → amount override → send invoice email manually → record payments as an editable period table (POST /api/rentals/payments, optional autoAllocate).'),
    bullet('Ended current leases stay visible on the overview. Tenant profiles include extra contact fields and split addresses; meter access is permission rental_meters.'),
    bullet('Note: rentals use separate rental_activity_logs (not the unified activity_logs table). Cron materializes periods only — invoice email auto-dispatch is disabled.'),

    h2('7.9 Kitchen & Kitchen Prep'),
    h3('Kitchen (/kitchen) — inventory & gift boxes'),
    bullet('Company-wide inventory (resolveKitchenOwnerUserId). Two-tier stock: kitchen_finished (SKU bottles) + kitchen_raw (total/allocated; available = total − allocated) + kitchen_gift_boxes.'),
    bullet('Admin catalog: kitchen_settings.catalog_json / formulas_json (KitchenAdminPanel). Raw names, gift-box types, capacities, and stew formulas are editable; gift-box BOMs consume finished bottles + raw (including 隨心燉 燕餅/冰糖 and 花月禮盒 75g tall bottle).'),
    bullet('Holiday mode raises gift-box min stock (10 → 20). Admins can adjust_stock (set/add) on raw, finished, or gift boxes.'),
    bullet('Make / allocate / return-gift write kitchen_movements and kitchen_order_fulfillments. Restock adds raw; completing kitchen-prep can add finished stock. Void a movement via POST /api/kitchen/movements/[id]/void.'),
    bullet('Page load is split: GET /api/kitchen/state?lite=1 (optional inventory/orders flags), GET /api/kitchen/inventory, GET /api/kitchen/orders, GET /api/kitchen/catalog, GET /api/kitchen/movements. Mutating routes: POST make-gift-box, allocate-gift-box, make-return-gift, restock, adjust-stock; PATCH settings.'),
    bullet('Lib: kitchen.ts, kitchen-bom.ts, kitchen-catalog.ts, kitchen-server.ts, kitchen-catalog-server.ts, kitchen-ship-allocate.ts.'),
    h3('Kitchen Prep (/kitchen-prep) — stewing calculator'),
    bullet('Independent prep orders, also company-wide. Statuses: not_started → scheduled → prepped → stewing → completed (wedding/回禮 stay not_started until the stewing/production date).'),
    bullet('Default CAPACITY_FLAVOR_FORMULAS (25g / 45g flavor rules) can be overridden by catalog formulas. “燕餅” in a formula is a placeholder — operator picks large/small bird-nest type per flavor. Water grams are shown as stew ingredients.'),
    bullet('Created via POST /api/kitchen-prep, ensurePrepFromWeddingOrder on order create/PATCH, or cron /api/cron/kitchen-prep-import. List supports status filter, persisted list filters, bulk delete.'),
    bullet('Calculate → print (landscape-friendly) → complete (yield / splits / exception tags) → activity on linked order + finished stock.'),
    bullet('Lib: kitchen-prep.ts + kitchen-prep-server.ts. Table: kitchen_prep_orders. Timestamps stored in HKT.'),

    h2('7.10 Stocks 庫存 (/stocks)'),
    bullet('Company org-scoped (getDataOwnerId) general inventory — not kitchen bottles/gift boxes.'),
    bullet('Table: stock_items (category, name, current_qty, safety_qty, optional icon_path). Below-safety highlighting.'),
    bullet('API: GET/POST /api/stocks, PATCH/DELETE /api/stocks/[id], POST stock-up, GET icon. Admin CRUD + photo icons; operators typically stock-up only.'),
    bullet('Lib: stocks.ts (client-safe) + stocks-server.ts.'),

    h2('7.11 Inbound shipments'),
    bullet('UI: /inbound'),
    bullet('API: /api/inbound, scan, /api/inbound-files/[id]'),
    bullet('OCR: PaddleOCR (if PADDLE_OCR_URL) → Gemini → tesseract + regex. SF 寄/收 heuristics in inbound-ocr.ts.'),
    bullet('Optional amount field on each shipment. Photos compressed client-side (max 1600px, <300KB JPEG) then saveReceipt(). Shared across the org pool (getDataOwnerId).'),

    h2('7.12 Settings / Integrations'),
    bullet('UI: /settings — Integrations panel'),
    bullet('API: /api/settings/integrations; QuickBooks OAuth via /api/integrations/quickbooks/connect (+ callback). Status on GET /api/hub.'),
    bullet('Tables: integration_settings (JSON), integration_tokens'),
    bullet('Stores Woo (nestiee / honour / honour_en / cupmoka), ClickUp (回禮 list), QuickBooks OAuth, Yedpay, SF Express, Resend per brand with order-type routing for email.'),

    h2('7.13 Unified activity logs'),
    bullet('Lib: src/lib/activity.ts — logActivity, getActivities, entityBelongsToUser (server-only).'),
    bullet('API: GET/POST /api/activities?type=&id='),
    bullet('UI: src/components/ActivityFeed.tsx'),
    bullet('Table: activity_logs (entity_type, entity_id, kind comment|activity, author, body).'),
    bullet('System events use author System (reminders, hub, etc.).'),

    h2('7.14 Supporting modules'),
    bullet('Admin (/admin): user + permission management (DB-backed role_permissions)'),
    bullet('Trash (/trash): soft-delete via trash.ts → deleted_records'),
    bullet('Scan-to-table (/scan-table): Gemini/OCR → editable grid → client xlsx export'),
    bullet('Debit notes (/billing/debit-note): rental billing documents'),
    bullet('Auth: /login, /register + /api/auth/*'),
  );

  // ─── 8. Flows ──────────────────────────────────────────────────
  children.push(
    h1('8. End-to-End Flows'),
    p('These are the lifecycles you should be able to trace after onboarding.'),

    h2('8.1 Sales path: Quotation → Order → Invoice'),
    numbered('Create quotation with line items (/quotations → POST /api/quotations).'),
    numbered('Convert: POST /api/quotations/[id]/convert { target: "order" } → creates order, sets quotation_id, status approved, logs both entities.'),
    numbered('Alternatively convert/copy to invoice (convert vs copy-to-invoice differ on quotation status).'),
    numbered('On invoice detail, set order_id (or use invoice convert to order). Bidirectional chips appear.'),
    numbered('Order payment badge derives from linked invoice status (paid → green 全數付清; else unpaid/overdue).'),
    rich({ text: 'Key files: ', bold: true }, 'quotation-server.ts, quotation-to-invoice-server.ts, invoices.ts, order-server.ts, activity.ts'),

    h2('8.2 Hub import: WooCommerce / ClickUp / QuickBooks'),
    numbered('Configure stores under Settings → Integrations (or env overlays). Connect QuickBooks from /hub when configured.'),
    numbered('Manual: /hub UI → POST /api/hub/import/[platform] (Woo config/ingest helpers under the same tree).'),
    numbered('Cron: GET|POST /api/cron/hub-sync with Bearer CRON_SECRET (GitHub Actions every 15 minutes).'),
    numbered('Woo: syncWooStore → upsertHubOrder maps line items into fields_json by order type (honour_lines, nestiee_lines, Nestiee gift-box qtys from product names/EPO, shipping, notes, payments). Honour EN and Cupmoka have dedicated mappings. ClickUp 回禮 tasks upsert when token/list are set.'),
    numbered('QuickBooks: upsertHubInvoice + hub-link matching heuristics to existing orders.'),
    rich({ text: 'Key files: ', bold: true }, 'hub-sync.ts, hub-server.ts, hub-link.ts, woocommerce-client.ts, .github/workflows/hub-sync-cron.yml'),

    h2('8.3 Expense path: Scan / Import → Numbering → Storage'),
    numbered('Scan: POST /api/expenses/scan (OpenAI vision or tesseract) pre-fills merchant/date/amount.'),
    numbered('Create/import: assignExpenseNumbersAtomic() assigns Expense ID + Receipt No.'),
    numbered('Images: saveReceipt() → disk or R2; rows in expense_receipts; receipt_path = primary. Replacing an upload cleans the old file; cron /api/cron/orphan-receipts sweeps unused OCR blobs.'),
    numbered('List filters/sorts client-side; export SheetJS xlsx; print /expenses/print?ids=…'),
    rich({ text: 'Key files: ', bold: true }, 'expense-server.ts, receipt.ts, expenses.ts, expense-import route'),

    h2('8.4 Payment verification: Order → Accounting → Reconciliation'),
    numbered('On order Payment Detail, upload receipt (compressed) via POST /api/payments/scan; fill date/amount/bank/method/ref for slots 1–3.'),
    numbered('Accounting view ( /reconciliation?view=accounting or /accounting ) lists each installment; Confirm Entry PATCHes fields.payment_verified.'),
    numbered('Reconciliation: upload bank CSV or sync Yedpay → match / link payment → approve (sets verified, logs activity).'),
    rich({ text: 'Key files: ', bold: true }, 'orders detail page, accounting route, reconciliation-server.ts, reconciliation-page-utils.ts'),

    h2('8.5 Payment reminders (30-day)'),
    numbered('Cron or UI “Run 30-day reminders”: POST /api/cron/payment-reminders (Bearer CRON_SECRET for all users).'),
    numbered('Finds unpaid invoices ≥ REMINDER_DAYS old; emails via Resend using brand credentials from Integrations (order type → Honour/Nestiee; Cupmoka-style unassigned may skip).'),
    numbered('Sets invoices.last_reminder_at; logs [System] activity on invoice and linked order.'),
    rich({ text: 'Key files: ', bold: true }, 'payment-reminders-server.ts, email.ts'),

    h2('8.6 Rental billing'),
    numbered('Create/edit rental unit (lease master: rent, due day, auto-create periods / receipt email toggles).'),
    numbered('Monthly rental_records materialized for billing periods; amount can be overridden.'),
    numbered('Send invoice email manually (POST …/records/[id]/invoice); record payments via POST /api/rentals/payments.'),
    numbered('Cron: /api/cron/rental-invoices → runRentalInvoiceDispatch() (materialize only; email dispatch disabled).'),
    numbered('Meters: photo OCR (Paddle → Gemini → tesseract) on /rentals/meters.'),
    rich({ text: 'Key files: ', bold: true }, 'rental-server.ts, meter-ocr.ts'),

    h2('8.7 Kitchen prep from bird-nest order'),
    numbered('Prep rows created by ensurePrepFromWeddingOrder on order create/PATCH, or cron GET|POST /api/cron/kitchen-prep-import.'),
    numbered('Detail page computes per-flavor weights from catalog formulas (defaults: CAPACITY_FLAVOR_FORMULAS). Operator chooses large/small 燕餅 when the formula uses the 燕餅 placeholder; water lines are included.'),
    numbered('Advance status scheduled → prepped → stewing; print prep sheet; complete with expected vs actual yield → status completed.'),
    numbered('Logs to linked order ActivityFeed; may update kitchen finished stock.'),
    rich({ text: 'Key files: ', bold: true }, 'kitchen-prep.ts, kitchen-prep-server.ts, kitchen-catalog.ts'),

    h2('8.8 Kitchen fulfillment: Nestiee / 回禮 ship'),
    numbered('Kitchen page shows open-order demand (gift boxes + bottles) vs on-hand stock; operators package gift boxes from inventory with qty presets (min stock / holiday top-up).'),
    numbered('Manual allocate/return-gift deducts stock and records kitchen_order_fulfillments.'),
    numbered('When an order first becomes shipped, PATCH /api/orders/[id] auto-allocates remaining gift/bottle needs. If stock is short, API returns kitchen_shortage and the UI asks to ship without deducting.'),
    rich({ text: 'Key files: ', bold: true }, 'kitchen-server.ts, kitchen-ship-allocate.ts, kitchen-bom.ts, src/app/api/orders/[id]/route.ts'),
  );

  // ─── 9. Conventions ────────────────────────────────────────────
  children.push(
    h1('9. Shared Engineering Conventions'),
    h2('9.1 UI pattern'),
    bullet('Authenticated pages are typically "use client" + AppLayout + fetch(/api/…) on mount. Heavy kitchen/order panels are lazy-loaded.'),
    bullet('Global filters/sorting for Expenses, Invoices, Orders, and Kitchen Prep are client-side after fetch; list filter choices persist across navigation (FilterBar).'),
    bullet('Sidebar nav is permission-gated (src/components/nav-items.ts).'),
    h2('9.2 Uploads & compression'),
    bullet('Browser compresses images before upload: src/lib/imageCompression.ts (max ~1600px, target <300KB JPEG).'),
    bullet('Heavy PDFs: src/lib/pdfCompression.ts → page JPEG array (original PDF not uploaded for design proofs).'),
    bullet('Payment receipts often use quality ~0.65.'),
    h2('9.3 File serving'),
    bullet('Auth-scoped routes: /api/receipts/[id], /api/order-files/[id], /api/invoice-files/[id], /api/quotation-files/[id], /api/inbound-files/[id], payment-receipt, etc.'),
    bullet('Ownership checked by joining back to the parent row’s user_id (ownerId).'),
    h2('9.4 Soft delete'),
    bullet('trash.ts moves records into deleted_records for recoverable trash UI.'),
    h2('9.5 Numbering'),
    bullet('Orders: stored ORD-####### via record-numbering.ts + global_record_sequences (sequence bump is autocommit so a rolled-back INSERT cannot reuse a number).'),
    bullet('Quotations / invoices: stored 8-digit numbers. UI display prefixes (“Order ”, “Invoice ”, “Quotation ”) are display-only in record-numbering-core.ts.'),
    bullet('Expenses: expense_report_sequence + per-month/funding-source receipt serials in assignExpenseNumbersAtomic().'),
    h2('9.6 Activity logging pattern'),
    codeLine("await logActivity('invoice', invoiceId, userId, 'activity', authorName, 'linked to order …');"),
    codeLine("await logActivity('order', orderId, userId, 'activity', authorName, 'linked from invoice …');"),
    p('Never import activity.ts into client components.'),
  );

  // ─── 10. Deploy ────────────────────────────────────────────────
  children.push(
    h1('10. Deploy & Operations'),
    h2('10.1 Railway (production)'),
    numbered('Connect repo branch main; Root Directory empty (repo root has package.json).'),
    numbered('Attach Railway Postgres → set DATABASE_URL.'),
    numbered('Set JWT_SECRET.'),
    numbered('Receipt storage — pick one:'),
    bullet('Option A (recommended): Cloudflare R2 — R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL.', 1),
    bullet('Option B: Railway volume e.g. mount /data, RECEIPTS_DIR=/data/receipts.', 1),
    p(
      'Without R2 or a volume, container redeploys wipe local images while DB rows still point at filenames. That is the most common production footgun.',
    ),
    numbered('railpack.json / railway.json drive npm run build + npm start.'),
    h2('10.2 Optional PaddleOCR sidecar'),
    bullet('Second Railway service; Root Directory services/paddle-ocr; ≥2GB RAM.'),
    bullet('On Next.js service: PADDLE_OCR_URL=http://<paddle-service>.railway.internal:8000'),
    bullet('Optional shared PADDLE_OCR_SECRET. Details: services/paddle-ocr/README.md.'),
    h2('10.3 Cron jobs'),
    headerTable(
      ['Job', 'Route', 'Notes'],
      [
        ['Hub sync', '/api/cron/hub-sync', 'Woo + Honour EN + Cupmoka + QB + ClickUp; GitHub Actions every 15 min; also overdue marking'],
        ['Payment reminders', '/api/cron/payment-reminders', '≥ REMINDER_DAYS unpaid; Resend + activity'],
        ['Rental invoices', '/api/cron/rental-invoices', 'Materialize periods + overdue only; email dispatch disabled'],
        ['Reconciliation', '/api/cron/reconciliation', 'Yedpay sync all users'],
        ['Kitchen prep import', '/api/cron/kitchen-prep-import', 'Auto-import bird-nest orders'],
        ['Orphan receipts', '/api/cron/orphan-receipts', 'Sweep unused uploads (Bearer CRON_SECRET; dry_run / min_age_hours query params)'],
      ],
      [2600, 3600, 3600],
    ),
    spacer(),
    p(
      'All cron routes accept Authorization: Bearer $CRON_SECRET for all-users mode. Hub sync workflow: .github/workflows/hub-sync-cron.yml needs APP_URL + CRON_SECRET GitHub secrets. Railway static outbound IPs may need allowlisting on Woo hosts.',
    ),
  );

  // ─── 11. Appendix ──────────────────────────────────────────────
  children.push(
    h1('11. Appendix'),
    h2('11.1 Key file index'),
    headerTable(
      ['Concern', 'Path'],
      [
        ['DB + boot', 'src/lib/db.ts, src/lib/pg-schema.sql'],
        ['Auth / JWT', 'src/lib/auth.ts'],
        ['Org scoping', 'src/lib/org-server.ts'],
        ['API guards', 'src/lib/api-guard.ts'],
        ['Permissions', 'src/lib/permissions.ts, permissions-server.ts'],
        ['Middleware', 'src/middleware.ts'],
        ['Client auth', 'src/components/AuthProvider.tsx'],
        ['App shell', 'src/components/AppLayout.tsx, Sidebar.tsx'],
        ['Activity', 'src/lib/activity.ts, components/ActivityFeed.tsx'],
        ['Orders', 'src/lib/orders.ts, order-server.ts, kitchen-ship-allocate.ts'],
        ['Invoices', 'src/lib/invoices.ts'],
        ['Quotations', 'src/lib/quotation-server.ts'],
        ['Expenses', 'src/lib/expense-server.ts, receipt.ts'],
        ['Kitchen', 'src/lib/kitchen.ts, kitchen-server.ts, kitchen-bom.ts, kitchen-catalog.ts'],
        ['Kitchen prep', 'src/lib/kitchen-prep.ts, kitchen-prep-server.ts'],
        ['Stocks', 'src/lib/stocks.ts, stocks-server.ts'],
        ['Hub sync', 'src/lib/hub-sync.ts, hub-server.ts'],
        ['Email', 'src/lib/email.ts'],
        ['Storage', 'src/lib/receipt.ts, r2.ts'],
        ['Ops docs', 'README.md, AGENTS.md'],
      ],
      [2800, 7000],
    ),
    spacer(),
    h2('11.2 Glossary'),
    headerTable(
      ['Term', 'Meaning'],
      [
        ['ownerId / data owner', 'Org admin user id used as user_id on business rows (getDataOwnerId)'],
        ['fields_json', 'JSON blob on orders for long custom-field list'],
        ['ORDER_SHIPPING_METHODS', 'Shipment Detail shipping options in orders.ts'],
        ['Expense ID', 'Global EXP-0000001 serial (batch_id)'],
        ['Receipt No.', 'EXP-YYYYMM-{code}{serial} per month + funding source'],
        ['Hub', 'Order Hub import/sync from WooCommerce (incl. Honour EN / Cupmoka), QuickBooks, ClickUp'],
        ['Kitchen owner', 'Shared company kitchen/prep user id (KITCHEN_OWNER_USER_ID / resolveKitchenOwnerUserId)'],
        ['ActivityFeed', 'Shared sidebar for orders, invoices, quotations'],
        ['*-server.ts', 'Server-only DB module — do not import in client'],
        ['CRON_SECRET', 'Bearer token for scheduled /api/cron/* jobs'],
        ['saveReceipt', 'Persist upload to disk or R2; returns path/URL'],
      ],
      [3200, 6600],
    ),
    spacer(),
    h2('11.3 Checklist: adding a new API feature'),
    numbered('Decide the permission section (permissions.ts / nav-items) if a new page is needed.'),
    numbered('Add tables to pg-schema.sql with user_id NOT NULL REFERENCES users(id) (and indexes).'),
    numbered('Put pure types/formulas in a client-safe lib; put DB access in *-server.ts.'),
    numbered('Write route.ts: getSessionFromRequest → denyReadOnlyWrite → getDataOwnerId → query with user_id = ownerId.'),
    numbered('Log cross-entity events with logActivity when relevant.'),
    numbered('Serve files via an auth-scoped GET that joins ownership.'),
    numbered('Wire a client page that fetches the API (AppLayout + error/loading states).'),
    numbered('Add Vitest coverage for numbering/matching/pure logic where feasible.'),
    numbered('Run npm run build to type-check.'),
    spacer(),
    h2('11.4 Related living documents'),
    bullet('README.md — features overview, env vars, Railway, hub-sync cron setup'),
    bullet('AGENTS.md — deep module conventions (OCR, kitchen formulas, expense numbering, etc.)'),
    bullet('services/paddle-ocr/README.md — OCR sidecar deploy'),
    bullet('src/lib/pg-schema.sql — authoritative table definitions'),
    spacer(),
    p(
      'End of InvoiceFlow Internal Technical Onboarding Guide. Regenerate this file after major architecture changes with: npm run docs:onboarding',
      { italics: true },
    ),
  );

  return children;
}

async function main() {
  const doc = new Document({
    creator: 'InvoiceFlow',
    title: 'InvoiceFlow Internal Technical Onboarding Guide',
    description:
      'Detailed internal technical document for new developers learning the InvoiceFlow codebase and flows.',
    styles: {
      default: {
        document: {
          styles: [
            {
              id: 'Normal',
              name: 'Normal',
              run: { font: 'Calibri', size: 22 },
            },
          ],
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickStyle: true,
          run: { size: 32, bold: true, color: '1E3A5F', font: 'Calibri' },
          paragraph: {
            spacing: { before: 360, after: 200 },
            outlineLevel: 0,
          },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickStyle: true,
          run: { size: 26, bold: true, color: '334155', font: 'Calibri' },
          paragraph: {
            spacing: { before: 280, after: 140 },
            outlineLevel: 1,
          },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickStyle: true,
          run: { size: 24, bold: true, color: '475569', font: 'Calibri' },
          paragraph: {
            spacing: { before: 200, after: 100 },
            outlineLevel: 2,
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: '○',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 1080, hanging: 360 },
                },
              },
            },
          ],
        },
        {
          reference: 'numbers',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: MARGIN,
              right: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'InvoiceFlow — Internal Technical Onboarding',
                    size: 16,
                    color: '94A3B8',
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: '94A3B8' }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({ text: ' of ', size: 16, color: '94A3B8' }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        children: buildChildren(),
      },
    ],
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT, buffer);
  console.log(`Wrote ${OUT} (${buffer.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
