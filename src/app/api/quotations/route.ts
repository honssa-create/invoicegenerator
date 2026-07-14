import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { generateQuoteNumber, getQuotationWithDetails } from '@/lib/quotation-server';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = getDataOwnerId(session.userId);
  const rows = db
    .prepare('SELECT id FROM quotations WHERE user_id = ? ORDER BY created_at DESC')
    .all(ownerId) as { id: number }[];
  const quotations = rows.map((r) => getQuotationWithDetails(r.id, ownerId)).filter(Boolean);
  return NextResponse.json({ quotations });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);

  try {
    const body = await request.json();
    const { customer_id, issue_date, valid_until, tax_rate = 0, notes, terms, status = 'draft', items = [] } = body;

    if (!issue_date) return NextResponse.json({ error: 'Issue date is required' }, { status: 400 });

    const quoteNumber = generateQuoteNumber(ownerId);

    const create = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO quotations (user_id, customer_id, quote_number, status, issue_date, valid_until, tax_rate, notes, terms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ownerId,
          customer_id || null,
          quoteNumber,
          status,
          issue_date,
          valid_until?.trim() || null,
          tax_rate,
          notes?.trim() || null,
          terms?.trim() || null
        );
      const qid = result.lastInsertRowid as number;
      const insertItem = db.prepare(
        'INSERT INTO quotation_items (quotation_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)'
      );
      for (const item of items) {
        if (!item.description?.trim()) continue;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        insertItem.run(qid, item.description.trim(), qty, price, qty * price);
      }
      return qid;
    });

    const qid = create();
    logActivity('quotation', qid, session.userId, 'activity', session.name, `created this quotation (${quoteNumber})`);
    return NextResponse.json({ quotation: getQuotationWithDetails(qid, ownerId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create quotation' }, { status: 500 });
  }
}
