/**
 * Truncate all Postgres tables except `users`.
 *
 * Usage:
 *   ALLOW_CLEAR_DB=true DATABASE_URL=postgresql://… npm run db:clear
 */
import { clearDatabaseExceptUsers, isClearDbAllowed } from '../src/lib/clear-db';
import { getPool } from '../src/lib/db';

async function main() {
  if (!isClearDbAllowed()) {
    console.error('Refusing to clear: set ALLOW_CLEAR_DB=true (or 1 / yes) first.');
    process.exit(1);
  }

  console.warn('Clearing all database tables except users…');
  const result = await clearDatabaseExceptUsers();
  console.log(`Truncated ${result.truncated.length} table(s):`);
  for (const t of result.truncated) console.log(`  - ${t}`);
  console.log('Users preserved. Expense sequence + role permissions re-seeded.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPool().end();
    } catch {
      /* ignore */
    }
  });
