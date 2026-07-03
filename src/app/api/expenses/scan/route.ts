import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { saveReceipt, scanReceipt } from '@/lib/receipt';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
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

  const files = formData.getAll('receipt').filter((f): f is File => f instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: 'No receipt image uploaded' }, { status: 400 });
  }

  const savedPaths: string[] = [];
  let firstBuffer: Buffer | null = null;
  let firstType = '';

  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload PNG, JPG, WEBP or GIF images.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Each image must be under 10 MB' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    savedPaths.push(saveReceipt(buffer, file.type));
    if (!firstBuffer) {
      firstBuffer = buffer;
      firstType = file.type;
    }
  }

  // Run OCR / AI vision only on the first image to auto-fill the form.
  const result = firstBuffer ? await scanReceipt(firstBuffer, firstType) : null;
  if (result) result.receipt_path = savedPaths[0];

  return NextResponse.json({
    result,
    receipts: savedPaths.map((path) => ({ path })),
  });
}
