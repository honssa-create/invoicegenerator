import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { parseOrderTags } from '@/lib/orders';

/** Distinct free-form tags used across the org's orders. */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const rows = (await db
    .prepare('SELECT fields_json FROM orders WHERE user_id = ?')
    .all(ownerId)) as Array<{ fields_json: string | null }>;

  const tags = new Set<string>();
  for (const row of rows) {
    let fields: Record<string, unknown> = {};
    try {
      fields = row.fields_json ? JSON.parse(row.fields_json) : {};
    } catch {
      fields = {};
    }
    for (const t of parseOrderTags(fields)) tags.add(t);
  }

  return NextResponse.json({ tags: Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh')) });
}
