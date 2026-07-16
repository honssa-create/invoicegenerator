import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import {
  deleteManagedOption,
  listManagedOptions,
  updateManagedOption,
} from '@/lib/expense-options-server';
import { getDataOwnerId } from '@/lib/org-server';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireApiAccess(request, 'settings');
  if (session instanceof NextResponse) return session;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid option id' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const value = typeof body.value === 'string' ? body.value : '';
    const ownerId = getDataOwnerId(session.userId);
    const result = updateManagedOption(ownerId, id, value);

    if (!result.option) {
      return NextResponse.json({ error: result.error || 'Failed to update option' }, { status: 400 });
    }

    return NextResponse.json({
      option: result.option,
      options: listManagedOptions(ownerId),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update option' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await requireApiAccess(_request, 'settings');
  if (session instanceof NextResponse) return session;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid option id' }, { status: 400 });
  }

  try {
    const ownerId = getDataOwnerId(session.userId);
    const result = deleteManagedOption(ownerId, id);

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Failed to delete option' }, { status: 404 });
    }

    return NextResponse.json({ options: listManagedOptions(ownerId) });
  } catch {
    return NextResponse.json({ error: 'Failed to delete option' }, { status: 500 });
  }
}
