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
  // Pull only the tags key when present — avoid shipping full fields_json blobs.
  const rows = (await db
    .prepare(
      `SELECT CASE
         WHEN fields_json IS NULL OR btrim(fields_json) = '' THEN NULL
         ELSE fields_json::jsonb->'tags'
       END AS tags
       FROM orders
       WHERE user_id = ?
         AND fields_json IS NOT NULL
         AND btrim(fields_json) <> ''
         AND jsonb_exists(fields_json::jsonb, 'tags')`
    )
    .all(ownerId)) as Array<{ tags: unknown }>;

  const tags = new Set<string>();
  for (const row of rows) {
    const fields = { tags: row.tags };
    for (const t of parseOrderTags(fields)) tags.add(t);
  }

  return NextResponse.json({ tags: Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh')) });
}
