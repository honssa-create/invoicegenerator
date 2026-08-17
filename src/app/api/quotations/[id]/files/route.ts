import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { saveReceipt } from '@/lib/receipt';

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);

  const quotation = await db
    .prepare('SELECT id FROM quotations WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId);
  if (!quotation) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const files = formData.getAll('file').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const insert = db.prepare(
    'INSERT INTO quotation_files (quotation_id, user_id, path, original_name) VALUES (?, ?, ?, ?)',
  );

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Each file must be under 20 MB' }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: 'Empty files are not allowed' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await saveReceipt(buffer, file.type || 'application/octet-stream', file.name);
    await insert.run(params.id, ownerId, path, file.name || null);
  }

  const list = await db
    .prepare('SELECT id, path, original_name FROM quotation_files WHERE quotation_id = ? ORDER BY id')
    .all(params.id);
  return NextResponse.json({ files: list }, { status: 201 });
}
