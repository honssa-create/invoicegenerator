# AGENTS.md

## Cursor Cloud specific instructions

InvoiceFlow is a single **Next.js 14 (App Router)** app backed by a local **SQLite** file via `better-sqlite3`. There are no other services to run.

### Running / building / testing
- Dev server: `npm run dev` (serves http://localhost:3000). This is the command to use during development.
- Build: `npm run build` — also runs TypeScript type-checking, so it doubles as the type check.
- Production run: `npm start` (only after a build; not needed for development).
- Lint: `npm run lint` is **not configured** in this repo — `next lint` will prompt interactively to create an ESLint config. There is no committed ESLint config, so treat lint as unavailable unless you intentionally add one.
- There is no automated test suite; verify changes manually via the UI or by hitting the JSON API routes under `/api/*`.

### Non-obvious notes
- The SQLite schema is created automatically on first import of `src/lib/db.ts` (tables + indexes via `CREATE TABLE IF NOT EXISTS`). No migration step is required.
- The database file lives at `data/invoices.db` (WAL mode). It is gitignored (`data/*.db*`); only `data/.gitkeep` is tracked. Delete `data/invoices.db*` to reset all users/data.
- `better-sqlite3` is a native module and is marked as an external server package in `next.config.js`; if you change Node versions, reinstall dependencies so its native binding is rebuilt.
- Auth uses JWT session cookies (`jose`) + bcrypt (`bcryptjs`). `JWT_SECRET` is optional in dev (falls back to a dev default); set it for production.
- Data is isolated per user; every API route scopes queries by the authenticated `user_id`.

### Expenses / receipt scanning / Excel export
- Receipt scanning (`POST /api/expenses/scan`, `src/lib/receipt.ts`) prefers OpenAI vision when `OPENAI_API_KEY` is set, otherwise falls back to **tesseract.js OCR**. On the first OCR call, tesseract.js downloads its language model (~15 MB) from a CDN and caches it, so the first scan needs network access and is slower than later ones. Set `OCR_LANGS` (default `eng`, e.g. `eng+chi_tra+chi_sim`) to add languages — extra languages trigger additional one-time model downloads. Neither key nor extra languages are required for the feature to work.
- Uploaded receipt images are stored on disk at `data/receipts/` (gitignored) and served (auth-scoped) via `GET /api/expenses/[id]/receipt`; the DB only stores the bare filename in `expenses.receipt_path`.
- Excel export (`GET /api/invoices/export`, `GET /api/expenses/export`) streams a real `.xlsx` built with `exceljs`. `tesseract.js` and `exceljs` are listed in `next.config.js` `serverComponentsExternalPackages` and must stay there.
- Each expense has an auto-generated sequential `receipt_no` (`EXP-<year>-NNNN`), assigned in the `expenses` POST route. `src/lib/db.ts` runs a startup migration that `ALTER TABLE`s the `receipt_no` column onto pre-existing databases and backfills numbers for old rows (idempotent — only fills NULL/empty values). Keep DB-touching code (like the number generator) out of `src/lib/expenses.ts`, which is imported by client components; server-only DB logic belongs in API routes or `src/lib/*` modules that are never imported client-side.
- The print view is a dedicated page at `/expenses/print?ids=1,2,3` (`src/app/expenses/print/`). It uses Tailwind `print:` variants; `globals.css` forces `print-color-adjust: exact` so the colored receipt-number header prints. Each selected receipt image is headed by its `receipt_no`.
- Multiple receipts per expense live in the `expense_receipts` table (one row per image). `src/lib/db.ts` backfills a legacy single `expenses.receipt_path` into it once; `receipt_path` is still kept as the "primary" (first) image. Serve any receipt image via `GET /api/receipts/[id]` (ownership checked by joining to `expenses.user_id`). The list/detail APIs attach a `receipts: {id, path}[]` array via `attachReceipts` in `src/lib/expense-server.ts` (server-only DB helpers — do not import into client components).
- Dropdown options (payment method / expense reason / platform) are user-managed: built-in defaults live in `DEFAULT_OPTIONS` (`src/lib/expenses.ts`, client-safe) and custom additions are stored per-user in the `expense_options` table. `GET/POST /api/expense-options` returns the merged (defaults + custom) lists. `category` is now free-form text (the old CHECK-free column already allowed this); `CATEGORY_LABELS`/`categoryLabel` only map legacy English values to friendly labels. The reusable searchable "type-to-add" dropdown is `src/components/TagSelect.tsx`.
- Note: this project uses `better-sqlite3` (not Prisma). Requests mentioning "Prisma schema" map to the SQL migrations in `src/lib/db.ts`.

### Numbering, import, filters, scan-to-table, exports
- Receipt numbers use **EXP-YYYYMM-XXX**, where YYYYMM is derived from the expense date (`paid_date`), not the upload date, and XXX is a per-month serial. `generateReceiptNumber(userId, expenseDate)` (`src/lib/expense-server.ts`) uses `MAX(serial)+1` for that month so delayed/backfilled entries slot into their real month. `src/lib/db.ts` renumbers any legacy/blank IDs into this format on boot and creates a UNIQUE index on `(user_id, receipt_no)` (guarded so boot never crashes).
- Batch import: `POST /api/expenses/import` parses .csv/.xlsx/.xls via SheetJS. **CSV files are decoded as UTF-8** (`XLSX.read(buf.toString('utf8'),{type:'string'})`) so Chinese headers survive — do not switch CSVs back to the binary reader. Column headers are matched by Chinese/English aliases (Date/日期, Payment/支付方式, Reason/支出原因, Platform/消費平台, Amount/金額, Supplier/供應商). Duplicates (same Date+Amount+Supplier) are skipped (both vs DB and within the batch); unseen payment methods/reasons/platforms are auto-added to `expense_options` ("tag sync").
- Global filters + sorting on the Expense and Invoice tables are **client-side** (data is fetched once, then filtered/sorted in the component). Both default-sort by date descending; header clicks toggle asc/desc. Shared bar: `src/components/FilterBar.tsx`.
- Scan-to-Table (`/scan-table`, `POST /api/scan-table`): uses **Google Gemini** when `GEMINI_API_KEY` is set (model via `GEMINI_MODEL`, default `gemini-2.5-flash`; the requested `gemini-3.5-flash` is not a public model — set the env var if it becomes available), otherwise falls back to on-device OCR for images (PDF requires the key). Returns a 2D array rendered into an editable grid; export is client-side SheetJS.
- All spreadsheet exports use **SheetJS (`xlsx`)** with `bookType:'xlsx'` for standard SpreadsheetML output (LibreOffice/OpenOffice/Google Sheets compatible). `xlsx` is in `next.config.js` `serverComponentsExternalPackages`. `exceljs` is no longer used by the export routes.

### Order Management module (ClickUp-style)
- Tables (`src/lib/db.ts`): `orders` (core columns + a `fields_json` TEXT blob for the long custom-field list), `order_files` (uploaded proof images, stored via `saveReceipt` in `data/receipts/`, served auth-scoped at `GET /api/order-files/[id]`), and `order_activities` (comment + system-activity feed).
- The custom-field list is defined once in `src/lib/orders.ts` (`ORDER_FIELDS`, client-safe); fields with a `col` map to a first-class column, the rest live in `fields_json`. Server hydration/helpers are in `src/lib/order-server.ts` (never import into client components).
- Detail page `/orders/[id]` is a two-pane layout: the left (~70%) content column scrolls independently and the right (~30%) Activity panel is a fixed full-height sidebar (`lg:h-[calc(100vh-7rem)]` on the row, `lg:overflow-y-auto` on the left) — this replaced `sticky`, which left a blank gap next to the long fields list. Fields autosave on blur (text) / change (select, checkbox) via `PATCH /api/orders/[id]` (`{core?, fields?}`); status changes auto-log an activity. Comments post to `POST /api/orders/[id]/activities`.
