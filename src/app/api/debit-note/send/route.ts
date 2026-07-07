import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { sendEmail } from '@/lib/email';
import { rentalOwnerId } from '@/lib/org-server';
import { buildFormalDebitNote } from '@/lib/rental-ledger-server';
import { currentBillingPeriod, formatMoney, type DebitNoteMode, type DebitNotePaymentTemplateId } from '@/lib/rentals';

function parseUnitIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? ids : undefined;
}

/**
 * POST /api/debit-note/send
 * Email formal debit note to tenant.
 */
export async function POST(request: Request) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = rentalOwnerId(session.userId);

  try {
    const body = await request.json();
    const tenantId = Number(body.tenantId);
    if (!Number.isFinite(tenantId) || tenantId <= 0) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const targetPeriod = body.targetPeriod || body.target_period || currentBillingPeriod();
    const mode = (body.mode || 'grouped') as DebitNoteMode;
    const unitId = body.unitId != null ? Number(body.unitId) : undefined;
    const unitIds = parseUnitIds(body.unitIds != null ? String(body.unitIds) : null);
    const paymentTemplate = body.paymentTemplate === 'elite' ? 'elite' : body.paymentTemplate === 'label' ? 'label' : undefined;
    const paymentRemark = body.paymentRemark || body.payment_remark || undefined;
    const paymentInstructionsText = body.paymentInstructionsText || body.payment_instructions_text || undefined;
    const footerRemark = body.footerRemark || body.footer_remark || undefined;

    if (mode === 'single' && !unitId) {
      return NextResponse.json({ error: 'unitId is required when mode is single' }, { status: 400 });
    }

    const doc = buildFormalDebitNote(tenantId, ownerId, targetPeriod, {
      fromPeriod: body.fromPeriod || body.from,
      paidLookbackMonths: body.paidLookbackMonths ?? body.paid_lookback,
      mode,
      unitId,
      unitIds,
      paymentTemplate: paymentTemplate as DebitNotePaymentTemplateId | undefined,
      paymentRemark,
      paymentInstructionsText,
      footerRemark,
    });

    if (!doc) {
      return NextResponse.json({ error: 'Tenant or unit not found' }, { status: 404 });
    }

    if (!doc.tenant.email?.trim()) {
      return NextResponse.json({ error: 'Tenant has no email address' }, { status: 400 });
    }

    const subject = `繳費通知單 Debit Note ${doc.noteNo} — ${doc.targetPeriodLabel}`;
    const html = `<p>Dear ${doc.tenant.name},</p>
      <p>Please find your debit note for <strong>${doc.targetPeriodLabel}</strong>.</p>
      <p><strong>Note No.:</strong> ${doc.noteNo}<br/>
      <strong>Total Amount Due:</strong> ${formatMoney(doc.grandTotal)}<br/>
      <strong>Due Date:</strong> ${doc.dueDateDisplay}</p>
      <p><strong>Premises:</strong> ${doc.premises}</p>
      <hr/>
      <pre style="font-family:sans-serif;white-space:pre-wrap;font-size:13px">${doc.paymentInstructionsText}</pre>
      ${doc.footerRemark ? `<p><em>${doc.footerRemark}</em></p>` : ''}
      <p>Thank you.</p>`;

    const email = await sendEmail(doc.tenant.email.trim(), subject, html);

    return NextResponse.json({ sent: email.sent, provider: email.provider, noteNo: doc.noteNo, email });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to send debit note' },
      { status: 400 },
    );
  }
}
