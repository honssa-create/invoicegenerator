import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';
import { trashQuotationFile } from '@/lib/trash';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);

  const row = await db
    .prepare(
      `SELECT f.path, f.original_name FROM quotation_files f
       JOIN quotations q ON q.id = f.quotation_id
       WHERE f.id = ? AND q.user_id = ?`,
    )
    .get(params.id, ownerId) as { path: string; original_name: string | null } | undefined;
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const response = await imageResponseForStoredPath(row.path);
  if (response.status !== 200) return response;

  const downloadName = (row.original_name || 'attachment').replace(/[\r\n"]/g, '');
  const headers = new Headers(response.headers);
  headers.set('Content-Disposition', `inline; filename="${downloadName}"`);
  return new NextResponse(response.body, { status: response.status, headers });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  if (!await trashQuotationFile(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
