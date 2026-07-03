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
