import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { listOrders } from '@/lib/order-server';
import { orderTitle } from '@/lib/orders';
import type { LedgerEntry } from '@/lib/cashflow';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);

  const entries: LedgerEntry[] = [];

  // Product Sales — order payments.
  for (const o of listOrders(session.userId)) {
    const amt = Number(o.fields.payment_amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const date = (o.fields.payment_date as string) || o.created_at.slice(0, 10);
    entries.push({
      key: `order-${o.id}`,
      kind: 'product',
      date,
      category: 'Product Sale',
      ref: o.po_number || orderTitle(o),
      account: (o.fields.payment_bank as string) || '',
      amount: amt,
      receiptUrl: o.fields.payment_receipt_path ? `/api/orders/${o.id}/payment-receipt` : null,
      verified: o.fields.payment_verified === true || o.fields.payment_verified === 'true',
      orderId: o.id,
    });
  }

  // Other Income — manual entries.
  const rows = db.prepare('SELECT * FROM other_income WHERE user_id = ?').all(session.userId) as {
    id: number; category: string | null; txn_date: string | null; amount: number; account: string | null; remarks: string | null; receipt_path: string | null; verified: number; created_at: string;
  }[];
  for (const r of rows) {
    entries.push({
      key: `income-${r.id}`,
      kind: 'other',
      date: r.txn_date || r.created_at.slice(0, 10),
      category: r.category || '其他',
      ref: r.remarks || '',
      account: r.account || '',
      amount: r.amount,
      receiptUrl: r.receipt_path ? `/api/other-income/${r.id}/receipt` : null,
      verified: r.verified === 1,
      incomeId: r.id,
    });
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const inMonth = (d: string) => (d || '').slice(0, 7) === month;
  const productSales = entries.filter((e) => e.kind === 'product' && inMonth(e.date)).reduce((s, e) => s + e.amount, 0);
  const otherIncome = entries.filter((e) => e.kind === 'other' && inMonth(e.date)).reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({
    month,
    totals: { productSales, otherIncome, gross: productSales + otherIncome },
    entries,
  });
}
