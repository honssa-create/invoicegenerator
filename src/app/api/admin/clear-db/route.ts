import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api-guard';
import { clearDatabaseExceptUsers, isClearDbAllowed } from '@/lib/clear-db';

/**
 * Destructive: truncate all tables except users.
 * Requires admin session + ALLOW_CLEAR_DB=true + body `{ "confirm": "CLEAR_ALL_DATA" }`.
 */
export async function POST(request: Request) {
  const session = await requireApiAdmin(request);
  if (session instanceof NextResponse) return session;

  if (!isClearDbAllowed()) {
    return NextResponse.json(
      { error: 'Clear DB is disabled. Set ALLOW_CLEAR_DB=true on the server.' },
      { status: 403 }
    );
  }

  let body: { confirm?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.confirm !== 'CLEAR_ALL_DATA') {
    return NextResponse.json(
      { error: 'Confirmation required: send { "confirm": "CLEAR_ALL_DATA" }' },
      { status: 400 }
    );
  }

  try {
    const result = await clearDatabaseExceptUsers();
    return NextResponse.json({
      ok: true,
      truncated: result.truncated,
      preserved: ['users'],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to clear database';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
