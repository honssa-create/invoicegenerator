/**
 * Next.js instrumentation hook (Next 14: requires `experimental.instrumentationHook`).
 * Runs once when the server process starts, so the schema check / boot migrations happen at
 * startup instead of on the first user request after every deploy or restart.
 */
export async function register(): Promise<void> {
  // Keep the import inside this literal check so webpack drops it from the edge bundle
  // (pg / fs are Node-only).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmSchemaOnStartup } = await import('./lib/instrumentation-node');
    warmSchemaOnStartup();
  }
}
