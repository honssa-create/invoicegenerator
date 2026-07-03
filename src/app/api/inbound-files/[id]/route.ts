import { NextResponse } from 'next/server';
import fs from 'fs';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { receiptFilePath, receiptContentType } from '@/lib/receipt';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const row = db
    .prepare('SELECT photo_path FROM inbound_shipments WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { photo_path: string | null } | undefined;
  if (!row?.photo_path) return NextResponse.json({ error: 'No photo' }, { status: 404 });

  const filePath = receiptFilePath(row.photo_path);
  if (!filePath) return NextResponse.json({ error: 'File missing' }, { status: 404 });

  const file = fs.readFileSync(filePath);
  return new NextResponse(file, {
    headers: { 'Content-Type': receiptContentType(row.photo_path), 'Cache-Control': 'private, max-age=3600' },
  });
}
