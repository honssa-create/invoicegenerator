import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { saveReceipt } from '@/lib/receipt';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const order = db
    .prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const files = formData.getAll('file').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });

  const insert = db.prepare(
    'INSERT INTO order_files (order_id, user_id, path, original_name) VALUES (?, ?, ?, ?)'
  );

  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Each image must be under 10 MB' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await saveReceipt(buffer, file.type, file.name);
    insert.run(params.id, session.userId, path, file.name || null);
  }

  const list = db
    .prepare('SELECT id, path, original_name FROM order_files WHERE order_id = ? ORDER BY id')
    .all(params.id);
  return NextResponse.json({ files: list }, { status: 201 });
}
