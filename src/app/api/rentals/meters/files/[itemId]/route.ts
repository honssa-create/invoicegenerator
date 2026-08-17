import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';
import { getUtilityMeterItemPhoto } from '@/lib/utility-meter-server';

export async function GET(request: Request, { params }: { params: { itemId: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const photo = await getUtilityMeterItemPhoto(params.itemId, await rentalOwnerId(session));
  if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  return imageResponseForStoredPath(photo.path);
}
