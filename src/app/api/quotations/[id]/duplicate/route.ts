import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getQuotationWithDetails, nextQuoteNumberAfter } from '@/lib/quotation-server';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

/** Duplicate a quotation with quote_number = source + 1 (next free if taken). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  const source = await getQuotationWithDetails(params.id, ownerId);
  if (!source) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  try {
    const { newId, quoteNumber } = await db.transaction(async () => {
      const quoteNumber = await nextQuoteNumberAfter(ownerId, source.quote_number);
      const result = await db
        .prepare(
          `INSERT INTO quotations (
             user_id, customer_id, quote_number, status, issue_date, valid_until, tax_rate, notes, terms,
             billing_address, shipping_address, email, send_later, ship_via, shipping_date, tracking_no, order_no,
             receipt_date, currency, discount_type, discount_value, shipping_amount
           ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          source.customer_id,
          quoteNumber,
          source.issue_date,
          source.valid_until,
          source.tax_rate,
          source.notes,
          source.terms,
          source.billing_address,
          source.shipping_address,
          source.email,
          source.send_later ? 1 : 0,
          source.ship_via,
          source.shipping_date,
          source.tracking_no,
          source.order_no,
          source.receipt_date,
          source.currency || 'HKD',
          source.discount_type === 'amount' ? 'amount' : 'percent',
          Number(source.discount_value) || 0,
          Number(source.shipping_amount) || 0,
        );
      const qid = result.lastInsertRowid as number;

      const insertItem = db.prepare(
        `INSERT INTO quotation_items (
           quotation_id, product_service, description, quantity, unit_price, amount, class_name
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of source.items) {
        await insertItem.run(
          qid,
          item.product_service,
          item.description,
          item.quantity,
          item.unit_price,
          item.amount,
          item.class_name,
        );
      }

      const insertFile = db.prepare(
        'INSERT INTO quotation_files (quotation_id, user_id, path, original_name) VALUES (?, ?, ?, ?)',
      );
      for (const f of source.files || []) {
        await insertFile.run(qid, ownerId, f.path, f.original_name);
      }

      return { newId: qid, quoteNumber };
    });

    await logActivity(
      'quotation',
      params.id,
      session.userId,
      'activity',
      session.name,
      `duplicated as ${quoteNumber}`,
    );
    await logActivity(
      'quotation',
      newId,
      session.userId,
      'activity',
      session.name,
      `created by duplicating ${source.quote_number}`,
    );

    return NextResponse.json(
      { id: newId, quote_number: quoteNumber, quotation: await getQuotationWithDetails(newId, ownerId) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to duplicate quotation' }, { status: 500 });
  }
}
