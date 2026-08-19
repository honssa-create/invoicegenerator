import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveDataOwnerId } from '@/lib/org-server';
import { createStockItem, listStockItems } from '@/lib/stocks-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await resolveDataOwnerId(session);
  const items = await listStockItems(ownerId);
  return NextResponse.json({ items, isAdmin: session.role === 'admin' });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can add stock items' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const ownerId = await resolveDataOwnerId(session);
    const result = await createStockItem(ownerId, {
      category: body.category,
      name: body.name,
      current_qty: body.current_qty,
      safety_qty: body.safety_qty,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ item: result.item });
  } catch {
    return NextResponse.json({ error: 'Failed to create stock item' }, { status: 500 });
  }
}
