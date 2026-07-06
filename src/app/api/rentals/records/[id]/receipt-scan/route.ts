import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { extractRentalReceipt } from '@/lib/rental-server';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;

  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }
  const file = formData.get('receipt');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No receipt uploaded' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Upload a PNG, JPG, or WEBP image' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await extractRentalReceipt(params.id, session.userId, buffer, file.type);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to process receipt';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
