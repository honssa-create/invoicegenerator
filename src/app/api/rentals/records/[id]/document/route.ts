import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { getRentDocument } from '@/lib/rental-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const doc = getRentDocument(params.id, rentalOwnerId(session.userId));
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}
