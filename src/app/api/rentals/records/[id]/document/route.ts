import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getRentDocument } from '@/lib/rental-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const doc = getRentDocument(params.id, session.userId);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}
