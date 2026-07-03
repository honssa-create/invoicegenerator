import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { saveReceipt, scanReceipt } from '@/lib/receipt';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = formData.get('receipt');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No receipt image uploaded' }, { status: 400 });
  }

  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Upload a PNG, JPG, WEBP or GIF image.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const receiptPath = saveReceipt(buffer, file.type);

  const result = await scanReceipt(buffer, file.type);
  result.receipt_path = receiptPath;

  return NextResponse.json({ result });
}
