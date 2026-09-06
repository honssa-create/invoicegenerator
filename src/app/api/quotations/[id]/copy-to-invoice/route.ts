import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getQuotationWithDetails } from '@/lib/quotation-server';
import { createInvoiceFromQuotation, findInvoiceForQuotation } from '@/lib/quotation-to-invoice-server';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

// Copy a quotation into a BRAND NEW invoice. The source quotation (and its line
// items) is only read here — it is never modified.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  const quote = await getQuotationWithDetails(params.id, ownerId);
  if (!quote) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  if (!quote.customer_id) {
    return NextResponse.json(
      { error: 'Add a customer to the quotation first — client name, email, phone and address are copied from it.' },
      { status: 400 }
    );
  }

  const existing = await findInvoiceForQuotation(params.id, ownerId);
  if (existing) {
    return NextResponse.json(
      {
        error: 'This quotation already has an invoice.',
        id: existing.id,
        invoice_number: existing.invoice_number,
      },
      { status: 409 },
    );
  }

  const { invoiceId, invoiceNumber: invNo } = await createInvoiceFromQuotation(quote, ownerId);

  await logActivity('quotation', params.id, session.userId, 'activity', session.name, `converted Quotation ${quote.quote_number} to a new Invoice`);
  await logActivity('invoice', invoiceId, session.userId, 'activity', session.name, `created by copying quotation ${quote.quote_number}`);

  return NextResponse.json({ id: invoiceId, invoice_number: invNo }, { status: 201 });
}
