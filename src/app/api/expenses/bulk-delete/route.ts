import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { trashExpense } from '@/lib/trash';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No expense ids provided' }, { status: 400 });
    }

    const uniqueIds = Array.from(
      new Set(
        ids
          .map((id: unknown) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    let deleted = 0;
    const not_found: number[] = [];
    for (const id of uniqueIds) {
      if (trashExpense(session, id)) deleted++;
      else not_found.push(id);
    }

    return NextResponse.json({ deleted, not_found, retention_days: 60 });
  } catch {
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }
}
