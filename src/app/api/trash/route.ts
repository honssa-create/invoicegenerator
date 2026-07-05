import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listTrash, TRASH_RETENTION_DAYS } from '@/lib/trash';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const records = listTrash(session.userId);
  return NextResponse.json({ records, retention_days: TRASH_RETENTION_DAYS });
}
