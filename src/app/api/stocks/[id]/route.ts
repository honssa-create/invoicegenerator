import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveDataOwnerId } from '@/lib/org-server';
import { deleteStockItem, updateStockItem } from '@/lib/stocks-server';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can adjust stock items' }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const ownerId = await resolveDataOwnerId(session);
    const patch: {
      category?: string;
      name?: string;
      current_qty?: number;
      safety_qty?: number;
    } = {};
    if (body.category !== undefined) patch.category = body.category;
    if (body.name !== undefined) patch.name = body.name;
    if (body.current_qty !== undefined) patch.current_qty = Number(body.current_qty);
    if (body.safety_qty !== undefined) patch.safety_qty = Number(body.safety_qty);

    const result = await updateStockItem(ownerId, id, patch);
    if (result.error) {
      const status = result.error === 'Item not found' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ item: result.item });
  } catch {
    return NextResponse.json({ error: 'Failed to update stock item' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can delete stock items' }, { status: 403 });
  }

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const ownerId = await resolveDataOwnerId(session);
    const result = await deleteStockItem(ownerId, id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete stock item' }, { status: 500 });
  }
}
