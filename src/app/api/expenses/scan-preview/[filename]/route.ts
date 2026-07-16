import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { imageResponseForStoredPath } from '@/lib/stored-image';
import { scanPreviewReceiptUrl } from '@/lib/image-url';

export async function GET(
  request: Request,
  { params }: { params: { filename: string } },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const decoded = decodeURIComponent(params.filename || '').trim();
  const previewPath = scanPreviewReceiptUrl(decoded);
  if (!previewPath) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  return imageResponseForStoredPath(decoded);
}
