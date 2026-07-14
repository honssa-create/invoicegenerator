import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { buildFormalDebitNote, buildRentPaymentNoticeMatrix } from '@/lib/rental-ledger-server';
import { currentBillingPeriod, type DebitNoteMode, type DebitNotePaymentTemplateId } from '@/lib/rentals';

function parseUnitIds(searchParams: URLSearchParams): number[] | undefined {
  const raw = searchParams.get('unit_ids') || searchParams.get('unitIds');
  if (!raw) return undefined;
  const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? ids : undefined;
}

/**
 * Debit note API.
 * GET /api/debit-note?tenantId=1&targetPeriod=2026-06&mode=grouped&unitIds=1,2,3&format=formal|matrix
 */
export async function GET(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const ownerId = rentalOwnerId(session.userId);
  const { searchParams } = new URL(request.url);

  const tenantId = searchParams.get('tenant_id') || searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId query parameter is required' }, { status: 400 });
  }

  const targetPeriod =
    searchParams.get('target_period') ||
    searchParams.get('targetPeriod') ||
    searchParams.get('period') ||
    currentBillingPeriod();

  const mode = (searchParams.get('mode') || 'grouped') as DebitNoteMode;
  const unitIdRaw = searchParams.get('unit_id') || searchParams.get('unitId');
  const unitId = unitIdRaw ? Number(unitIdRaw) : undefined;
  const unitIds = parseUnitIds(searchParams);
  const format = searchParams.get('format') || 'formal';

  if (mode === 'single' && !unitId) {
    return NextResponse.json({ error: 'unitId is required when mode is single' }, { status: 400 });
  }

  const fromPeriod = searchParams.get('from') || searchParams.get('from_period') || undefined;
  const paidLookbackRaw = searchParams.get('paid_lookback') || searchParams.get('paidLookback');
  const paidLookbackMonths = paidLookbackRaw !== null && paidLookbackRaw !== ''
    ? Number(paidLookbackRaw)
    : undefined;

  const paymentTemplateRaw = searchParams.get('paymentTemplate') || searchParams.get('payment_template');
  const paymentTemplate: DebitNotePaymentTemplateId | undefined =
    paymentTemplateRaw === 'label' || paymentTemplateRaw === 'elite' ? paymentTemplateRaw : undefined;
  const paymentRemark = searchParams.get('paymentRemark') || searchParams.get('payment_remark') || undefined;

  const query = {
    fromPeriod,
    paidLookbackMonths: Number.isFinite(paidLookbackMonths) ? paidLookbackMonths : undefined,
    mode,
    unitId,
    unitIds,
    paymentTemplate,
    paymentRemark,
  };

  try {
    if (format === 'matrix') {
      const matrix = buildRentPaymentNoticeMatrix(Number(tenantId), ownerId, targetPeriod, query);
      if (!matrix) {
        return NextResponse.json({ error: 'Tenant or unit not found' }, { status: 404 });
      }
      return NextResponse.json(matrix);
    }

    const doc = buildFormalDebitNote(Number(tenantId), ownerId, targetPeriod, query);
    if (!doc) {
      return NextResponse.json({ error: 'Tenant or unit not found' }, { status: 404 });
    }
    return NextResponse.json(doc);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build debit note' },
      { status: 400 },
    );
  }
}
