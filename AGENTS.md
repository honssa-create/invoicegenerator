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
