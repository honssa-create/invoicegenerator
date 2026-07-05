import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { markRentPaid } from '@/lib/rental-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const result = await markRentPaid(params.id, session.userId, {
      autoSendReceiptEmail: Boolean(body.autoSendReceiptEmail),
      note: body.note || null,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to mark paid';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
