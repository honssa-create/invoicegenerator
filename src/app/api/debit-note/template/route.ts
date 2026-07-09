import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { normalizeDebitNoteStyle, type DebitNoteStyleTemplate } from '@/lib/debit-note-style';
import {
  getDebitNoteStyleTemplate,
  listDebitNoteStyleTemplates,
  saveDebitNoteStyleTemplate,
} from '@/lib/debit-note-style-server';
import { rentalOwnerId } from '@/lib/org-server';
import { isSectionReadOnly } from '@/lib/permissions';
import { isTemplateCompanyVariantId, type TemplateCompanyVariantId } from '@/lib/document-templates';

function parseCompanyKey(raw: string | null): TemplateCompanyVariantId | null {
  return raw && isTemplateCompanyVariantId(raw) ? raw : null;
}

export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const { searchParams } = new URL(request.url);
  const company = parseCompanyKey(searchParams.get('company'));
  if (company) {
    return NextResponse.json({ company, style: getDebitNoteStyleTemplate(ownerId, company) });
  }
  return NextResponse.json({ styles: listDebitNoteStyleTemplates(ownerId) });
}

export async function PUT(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  if (isSectionReadOnly(session.role, 'rentals')) {
    return NextResponse.json({ error: 'Read-only access' }, { status: 403 });
  }
  const ownerId = rentalOwnerId(session.userId);
  let body: { company?: string; style?: Partial<DebitNoteStyleTemplate> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const company = parseCompanyKey(body.company ?? null);
  if (!company) {
    return NextResponse.json({ error: 'company must be label, elite, or joint' }, { status: 400 });
  }
  const style = saveDebitNoteStyleTemplate(ownerId, company, normalizeDebitNoteStyle(body.style));
  return NextResponse.json({ company, style, saved: true });
}
