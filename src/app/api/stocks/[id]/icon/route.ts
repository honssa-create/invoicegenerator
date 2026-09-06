import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveDataOwnerId } from '@/lib/org-server';
import { getStockItem } from '@/lib/stocks-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const ownerId = await resolveDataOwnerId(session);
  const item = await getStockItem(ownerId, id);
  if (!item?.icon_path) return NextResponse.json({ error: 'No photo' }, { status: 404 });

  return imageResponseForStoredPath(item.icon_path);
}
