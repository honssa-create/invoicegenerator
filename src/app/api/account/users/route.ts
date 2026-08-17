import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { requireApiSession } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';

/** Org members (owner + child users) for assignee pickers — any logged-in user. */
export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof NextResponse) return session;

  const ownerId = await getDataOwnerId(session);
  const rows = (await db
    .prepare(
      `SELECT id, name, email FROM users
       WHERE id = ? OR owner_user_id = ?
       ORDER BY name`
    )
    .all(ownerId, ownerId)) as Array<{ id: number; name: string; email: string }>;

  return NextResponse.json({
    users: rows.map((u) => ({ id: u.id, name: u.name, email: u.email })),
  });
}
