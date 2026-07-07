import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { recordTenantPaymentWithAllocations } from '@/lib/rental-ledger-server';
import { normalizeStoredDate } from '@/lib/rentals';

/**
 * Record payment with itemized billing-item allocations.
 * POST /api/payments
 * Body: { tenant_id, payment_date, amount, payment_method?, reference_no?, allocations: [{ billing_item_id, allocated_amount }] }
 */
export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;

  try {
    const body = await request.json();
    const tenantId = Number(body.tenant_id ?? body.tenantId);
    const paymentDate = normalizeStoredDate(body.payment_date ?? body.paymentDate) || new Date().toISOString().slice(0, 10);
    const amount = Number(body.amount);
    const method = body.payment_method ?? body.method ?? null;
    const reference = body.reference_no ?? body.reference ?? null;

    if (!tenantId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'tenant_id and positive amount required' }, { status: 400 });
    }

    const rawAllocations = Array.isArray(body.allocations) ? body.allocations : [];
    const allocations = (rawAllocations as { billing_item_id?: number; chargeItemId?: number; allocated_amount?: number; amount?: number }[])
      .map((a) => ({
        chargeItemId: Number(a.billing_item_id ?? a.chargeItemId),
        amount: Number(a.allocated_amount ?? a.amount),
      }))
      .filter((a) => a.chargeItemId && a.amount > 0);

    if (!allocations.length) {
      return NextResponse.json({ error: 'allocations array with billing_item_id and allocated_amount required' }, { status: 400 });
    }

    const result = recordTenantPaymentWithAllocations(rentalOwnerId(session.userId), {
      tenantId,
      paymentDate,
      amount,
      method,
      reference,
      notes: body.notes ?? null,
    }, allocations);

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Payment failed' },
      { status: 400 },
    );
  }
}
