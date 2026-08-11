import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { ocrUtilityMeterPhoto } from '@/lib/utility-meter-server';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }
  const file = formData.get('photo') || formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No photo uploaded' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Upload a PNG, JPG, or WEBP image' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 400 });
  }

  const kindRaw = String(formData.get('kind') || '').trim().toLowerCase();
  const kind =
    kindRaw === 'water' || kindRaw === 'electricity'
      ? (kindRaw as 'water' | 'electricity')
      : undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await ocrUtilityMeterPhoto(buffer, file.type, file.name || 'meter.jpg', kind);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to OCR meter photo';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
