import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPrepOrder, resolveKitchenOwnerUserId } from '@/lib/kitchen-prep-server';
import { logPrepSheetPrint } from '@/lib/kitchen-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const order = await getPrepOrder(params.id);
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const kitchenOwnerId = await resolveKitchenOwnerUserId();
    const result = await logPrepSheetPrint(kitchenOwnerId, session.userId, session.name, {
      prepOrderId: order.id,
      prepOrderCode: order.order_code,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to log print' }, { status: 500 });
  }
}
