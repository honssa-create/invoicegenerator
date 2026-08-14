import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { createManualPayment } from '@/lib/reconciliation-server';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/reconciliation';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  let body: {
    amount?: number | string;
    invoice_no?: string;
    order_no?: string;
    remarks?: string;
    receipt_path?: string;
    payment_method?: string;
    deposit_time?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Enter a valid amount (銀碼)' }, { status: 400 });
  }

  const paymentMethodRaw = String(body.payment_method || 'FPS').trim();
  if (!PAYMENT_METHODS.includes(paymentMethodRaw as PaymentMethod)) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
  }

  try {
    const ownerId = await getDataOwnerId(session.userId);
    const record = await createManualPayment(ownerId, {
      amount,
      invoice_no: body.invoice_no,
      order_no: body.order_no,
      remarks: body.remarks,
      receipt_path: body.receipt_path,
      payment_method: paymentMethodRaw as PaymentMethod,
      deposit_time: body.deposit_time,
      created_by: session.name,
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create payment';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
