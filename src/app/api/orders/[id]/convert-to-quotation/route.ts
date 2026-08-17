import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import {
  convertOrderToQuotation,
  getQuotationAfterOrderConversion,
} from '@/lib/order-to-quotation-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deniedOrders = denyReadOnlyWrite(session, 'orders', request.method);
  if (deniedOrders) return deniedOrders;

  const deniedQuotations = denyReadOnlyWrite(session, 'quotations', request.method);
  if (deniedQuotations) return deniedQuotations;

  const ownerId = await getDataOwnerId(session);

  try {
    const { quotationId, quoteNumber } = await convertOrderToQuotation(
      ownerId,
      Number(params.id),
      session.name
    );
    const quotation = await getQuotationAfterOrderConversion(ownerId, quotationId);
    return NextResponse.json({ id: quotationId, quote_number: quoteNumber, quotation }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to convert order';
    const status = message === 'Order not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
