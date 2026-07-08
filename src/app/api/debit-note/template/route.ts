import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { normalizeDebitNoteStyle, type DebitNoteStyleTemplate } from '@/lib/debit-note-style';
import { getDebitNoteStyleTemplate, saveDebitNoteStyleTemplate } from '@/lib/debit-note-style-server';
import { rentalOwnerId } from '@/lib/org-server';
import { isSectionReadOnly } from '@/lib/permissions';

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  return NextResponse.json({ style: getDebitNoteStyleTemplate(ownerId) });
}

export async function PUT(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  if (isSectionReadOnly(session.role, 'rentals')) {
    return NextResponse.json({ error: 'Read-only access' }, { status: 403 });
  }
  const ownerId = rentalOwnerId(session.userId);
  let body: { style?: Partial<DebitNoteStyleTemplate> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const style = saveDebitNoteStyleTemplate(ownerId, normalizeDebitNoteStyle(body.style));
  return NextResponse.json({ style, saved: true });
}
