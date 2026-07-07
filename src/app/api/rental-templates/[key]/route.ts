import { NextResponse } from 'next/server';
import { denyReadOnlyWrite, requireApiAccess } from '@/lib/api-guard';
import { rentalOwnerId } from '@/lib/org-server';
import { updateRentalTemplate } from '@/lib/rental-template-server';

export async function PATCH(
  request: Request,
  { params }: { params: { key: string } },
) {
  const session = await requireApiAccess(request, 'rentals');
  if (session instanceof NextResponse) return session;
  const denied = denyReadOnlyWrite(session, 'rentals', request.method);
  if (denied) return denied;
  const ownerId = rentalOwnerId(session.userId);
  try {
    const body = await request.json();
    const template = updateRentalTemplate(ownerId, params.key, {
      name: body.name,
      paymentInstructions: body.paymentInstructions,
      footerRemark: body.footerRemark,
      rentInvoiceNote: body.rentInvoiceNote,
      company: body.company,
    });
    return NextResponse.json({ template });
  } catch {
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
