import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { addLeaseDocument, getLeaseById } from '@/lib/rental-lease-server';
import type { LeaseDocumentType } from '@/lib/rentals';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;

  const ownerId = rentalOwnerId(session.userId);
  const leaseId = Number(params.id);
  const lease = getLeaseById(leaseId, ownerId);
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 });

  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  const docType = (form.get('docType') as LeaseDocumentType) || 'agreement';
  const label = form.get('label') as string | null;
  const buf = Buffer.from(await file.arrayBuffer());

  const doc = await addLeaseDocument(ownerId, leaseId, buf, file.type || 'application/octet-stream', docType, label);
  return NextResponse.json({ document: doc }, { status: 201 });
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const lease = getLeaseById(params.id, ownerId);
  if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId');
  if (!docId) {
    const { getLeaseDocuments } = await import('@/lib/rental-lease-server');
    return NextResponse.json({ documents: getLeaseDocuments(lease.id, ownerId) });
  }

  const { getLeaseDocuments } = await import('@/lib/rental-lease-server');
  const docs = getLeaseDocuments(lease.id, ownerId);
  const doc = docs.find((d) => d.id === Number(docId));
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const filePath = path.join(process.cwd(), 'data', 'receipts', doc.filePath);
  const buf = await readFile(filePath);
  const ext = path.extname(doc.filePath).toLowerCase();
  const mime = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
  return new NextResponse(buf, { headers: { 'Content-Type': mime, 'Content-Disposition': `inline; filename="${doc.filePath}"` } });
}
