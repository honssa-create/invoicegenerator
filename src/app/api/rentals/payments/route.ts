import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { createRentalPayment, recordTenantPaymentWithAllocations } from '@/lib/rental-ledger-server';
import { prepareAdvancePaymentAllocations } from '@/lib/rental-server';
import { normalizeStoredDate, type PeriodPaymentAllocation } from '@/lib/rentals';

export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  try {
    const body = await request.json();
    const paymentDate = normalizeStoredDate(body.paymentDate) || new Date().toISOString().slice(0, 10);
    const amount = Number(body.amount);
    const tenantId = Number(body.tenantId);
    if (!tenantId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'tenantId and positive amount required' }, { status: 400 });
    }

    const ownerId = rentalOwnerId(session.userId);
    let allocations = Array.isArray(body.allocations)
      ? (body.allocations as { chargeItemId: number; amount: number }[])
          .map((a) => ({
            chargeItemId: Number(a.chargeItemId),
            amount: Number(a.amount),
          }))
          .filter((a) => a.chargeItemId && a.amount > 0)
      : [];

    const periodAllocations = Array.isArray(body.periodAllocations)
      ? (body.periodAllocations as PeriodPaymentAllocation[])
          .map((r) => ({
            unitId: Number(r.unitId),
            billingPeriod: String(r.billingPeriod),
            amount: r.amount !== undefined ? Number(r.amount) : undefined,
            rent: r.rent !== undefined ? Number(r.rent) : undefined,
            water: r.water !== undefined ? Number(r.water) : undefined,
            electricity: r.electricity !== undefined ? Number(r.electricity) : undefined,
          }))
          .filter((r) => r.unitId && r.billingPeriod)
      : [];

    if (!allocations.length && (periodAllocations.length || body.autoAllocate)) {
      allocations = prepareAdvancePaymentAllocations(ownerId, tenantId, {
        amount,
        unitIds: Array.isArray(body.unitIds) ? body.unitIds.map(Number).filter(Boolean) : undefined,
        periodAllocations: periodAllocations.length ? periodAllocations : undefined,
        autoAllocate: Boolean(body.autoAllocate) || periodAllocations.length > 0,
      });
    }

    if (allocations.length) {
      const result = recordTenantPaymentWithAllocations(ownerId, {
        tenantId,
        paymentDate,
        amount,
        method: body.method,
        reference: body.reference,
        notes: body.notes,
        receiptImagePath: body.receiptImagePath,
      }, allocations);
      return NextResponse.json(result, { status: 201 });
    }

    const payment = createRentalPayment(ownerId, {
      tenantId,
      paymentDate,
      amount,
      method: body.method,
      reference: body.reference,
      notes: body.notes,
      receiptImagePath: body.receiptImagePath,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create payment' }, { status: 500 });
  }
}
