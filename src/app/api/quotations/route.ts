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

  const ownerId = await getDataOwnerId(session.userId);
  const rows = await db
    .prepare('SELECT id FROM quotations WHERE user_id = ? ORDER BY created_at DESC')
    .all(ownerId) as { id: number }[];
  const quotations = (await Promise.all(rows.map((r) => getQuotationWithDetails(r.id, ownerId)))).filter(Boolean);
  return NextResponse.json({ quotations });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);

  try {
    const body = await request.json();
    const {
      customer_id,
      issue_date,
      valid_until,
      tax_rate = 0,
      notes,
      terms,
      billing_address,
      shipping_address,
      email,
      send_later = false,
      ship_via,
      shipping_date,
      tracking_no,
      order_no,
      receipt_date,
      currency = 'HKD',
      discount_type = 'percent',
      discount_value = 0,
      shipping_amount = 0,
      status = 'draft',
      items = [],
    } = body;

    if (!issue_date) return NextResponse.json({ error: 'Issue date is required' }, { status: 400 });

    const quoteNumber = await generateQuoteNumber(ownerId);

    const qid = await db.transaction(async () => {
      const result = await db
        .prepare(
          `INSERT INTO quotations (
             user_id, customer_id, quote_number, status, issue_date, valid_until, tax_rate, notes, terms,
             billing_address, shipping_address, email, send_later, ship_via, shipping_date, tracking_no, order_no,
             receipt_date, currency, discount_type, discount_value, shipping_amount
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          terms?.trim() || null,
          billing_address?.trim() || null,
          shipping_address?.trim() || null,
          email?.trim() || null,
          send_later ? 1 : 0,
          ship_via?.trim() || null,
          shipping_date?.trim() || null,
          tracking_no?.trim() || null,
          order_no?.trim() || null,
          receipt_date?.trim() || null,
          currency?.trim() || 'HKD',
          discount_type === 'amount' ? 'amount' : 'percent',
          Number(discount_value) || 0,
          Number(shipping_amount) || 0
        );
      const qid = result.lastInsertRowid as number;
      const insertItem = db.prepare(
        `INSERT INTO quotation_items (
           quotation_id, service_date, product_service, description, quantity, unit_price, amount, class_name
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of items) {
        const desc = String(item.description || item.product_service || '').trim();
        if (!desc && !String(item.product_service || '').trim()) continue;
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        await insertItem.run(
          qid,
          item.service_date?.trim() || null,
          item.product_service?.trim() || null,
          desc || item.product_service?.trim() || '',
          qty,
          price,
          qty * price,
          item.class_name?.trim() || null
        );
      }
      return qid;
    });

    await logActivity('quotation', qid, session.userId, 'activity', session.name, `created this quotation (${quoteNumber})`);
    return NextResponse.json({ quotation: await getQuotationWithDetails(qid, ownerId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create quotation' }, { status: 500 });
  }
}
