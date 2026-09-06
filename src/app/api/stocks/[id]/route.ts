import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveDataOwnerId } from '@/lib/org-server';
import { deleteStockItem, saveStockIconFile, updateStockItem } from '@/lib/stocks-server';

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
    const contentType = request.headers.get('content-type') || '';
    const patch: {
      category?: string;
      name?: string;
      current_qty?: number;
      safety_qty?: number;
      icon_path?: string | null;
      clear_icon?: boolean;
    } = {};

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      if (form.has('category')) patch.category = String(form.get('category') || '');
      if (form.has('name')) patch.name = String(form.get('name') || '');
      if (form.has('current_qty')) patch.current_qty = Number(form.get('current_qty'));
      if (form.has('safety_qty')) patch.safety_qty = Number(form.get('safety_qty'));
      if (String(form.get('clear_icon') || '') === '1') patch.clear_icon = true;
      const file = form.get('icon');
      if (file instanceof File && file.size > 0) {
        const saved = await saveStockIconFile(file);
        if (saved.error) return NextResponse.json({ error: saved.error }, { status: 400 });
        patch.icon_path = saved.path || null;
        patch.clear_icon = false;
      }
    } else {
      const body = await request.json();
      if (body.category !== undefined) patch.category = body.category;
      if (body.name !== undefined) patch.name = body.name;
      if (body.current_qty !== undefined) patch.current_qty = Number(body.current_qty);
      if (body.safety_qty !== undefined) patch.safety_qty = Number(body.safety_qty);
      if (body.clear_icon) patch.clear_icon = true;
    }

    const ownerId = await resolveDataOwnerId(session);
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
