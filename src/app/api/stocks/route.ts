import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveDataOwnerId } from '@/lib/org-server';
import { createStockItem, listStockItems, saveStockIconFile } from '@/lib/stocks-server';

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
    const contentType = request.headers.get('content-type') || '';
    let category = '';
    let name = '';
    let current_qty: number | undefined;
    let safety_qty: number | undefined;
    let iconFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      category = String(form.get('category') || '');
      name = String(form.get('name') || '');
      if (form.has('current_qty')) current_qty = Number(form.get('current_qty'));
      if (form.has('safety_qty')) safety_qty = Number(form.get('safety_qty'));
      const file = form.get('icon');
      if (file instanceof File && file.size > 0) iconFile = file;
    } else {
      const body = await request.json();
      category = body.category;
      name = body.name;
      current_qty = body.current_qty;
      safety_qty = body.safety_qty;
    }

    let icon_path: string | null = null;
    if (iconFile) {
      const saved = await saveStockIconFile(iconFile);
      if (saved.error) return NextResponse.json({ error: saved.error }, { status: 400 });
      icon_path = saved.path || null;
    }

    const ownerId = await resolveDataOwnerId(session);
    const result = await createStockItem(ownerId, {
      category,
      name,
      current_qty,
      safety_qty,
      icon_path,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ item: result.item });
  } catch {
    return NextResponse.json({ error: 'Failed to create stock item' }, { status: 500 });
  }
}
