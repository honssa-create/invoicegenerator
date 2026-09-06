import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { sendRentInvoice } from '@/lib/rental-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = await rentalOwnerId(session);
  try {
    const body = await request.json();
    const result = await sendRentInvoice(params.id, ownerId, {
      waterFee: body.waterFee !== undefined ? Number(body.waterFee) : undefined,
      electricityFee: body.electricityFee !== undefined ? Number(body.electricityFee) : undefined,
      baseRentPeriodFrom: body.baseRentPeriodFrom,
      baseRentPeriodTo: body.baseRentPeriodTo,
      waterPeriodFrom: body.waterPeriodFrom,
      waterPeriodTo: body.waterPeriodTo,
      electricityPeriodFrom: body.electricityPeriodFrom,
      electricityPeriodTo: body.electricityPeriodTo,
      note: body.note || null,
      paymentTemplate: body.paymentTemplate === 'elite' ? 'elite' : body.paymentTemplate === 'label' ? 'label' : undefined,
      paymentRemark: body.paymentRemark || null,
      to: typeof body.to === 'string' ? body.to : undefined,
      subject: typeof body.subject === 'string' ? body.subject : undefined,
      body: typeof body.body === 'string' ? body.body : undefined,
    });

    if (!result.email.sent && result.email.provider === 'skipped') {
      return NextResponse.json(
        { error: result.email.error || 'Resend not configured', sent: false, provider: result.email.provider, ...result },
        { status: 422 },
      );
    }
    if (!result.email.sent && result.email.provider === 'resend') {
      return NextResponse.json(
        { error: result.email.error || 'Failed to send email', sent: false, provider: result.email.provider, ...result },
        { status: 502 },
      );
    }
    if (!result.email.sent) {
      return NextResponse.json(
        { error: result.email.error || 'Email was not sent', sent: false, provider: result.email.provider, ...result },
        { status: 422 },
      );
    }

    return NextResponse.json({ ...result, sent: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to send invoice';
    const status = (e as { status?: number })?.status === 400 ? 400 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
