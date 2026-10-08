import { ensureSchema } from './db';

/**
 * Fire-and-forget: the server keeps starting while this runs; requests that arrive early
 * simply await the same in-flight ensureSchema() promise. If it fails (e.g. DB not reachable
 * yet) the error is logged and the first request retries, exactly as before.
 */
export function warmSchemaOnStartup(): void {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (!process.env.DATABASE_URL?.trim()) return;
  ensureSchema().catch((err) => {
    console.error('[InvoiceFlow] Startup schema warm-up failed; will retry on first request:', err);
  });
}
