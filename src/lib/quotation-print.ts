import {
  DEFAULT_QUOTATION_PREVIEW,
  type QuotationPreviewModel,
} from '@/components/FormalQuotationDocument';
import type { QuotationWithDetails } from '@/lib/quotations';
import { formatQuotationDate, formatQuotationMoney } from '@/lib/quotation-style';

export interface QuotationPrintBusiness {
  name: string;
  company_name: string | null;
  email: string;
}

function customerBillingFallback(q: QuotationWithDetails): string {
  return [q.customer_name, q.customer_address, [q.customer_city, q.customer_state, q.customer_zip].filter(Boolean).join(', '), q.customer_email]
    .filter(Boolean)
    .join('\n');
}

function remarksFromQuote(q: QuotationWithDetails): string[] {
  const fromTerms = (q.terms || '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
  if (fromTerms.length) return fromTerms;
  return [...DEFAULT_QUOTATION_PREVIEW.remarks];
}

/** Map a saved quotation into the Honour Label formal print/preview model. */
export function quotationToFormalPreview(
  q: QuotationWithDetails,
  _business?: QuotationPrintBusiness | null,
): QuotationPreviewModel {
  const currency = q.currency || 'HKD';
  const money = (n: number) => formatQuotationMoney(n, currency);

  const companyAddressLines = [...DEFAULT_QUOTATION_PREVIEW.companyAddressLines];

  const items = (q.items || [])
    .filter((i) => String(i.description || i.product_service || '').trim())
    .map((i) => {
      const product = (i.product_service || '').trim();
      const desc = (i.description || '').trim();
      let name: string;
      let description: string;
      if (product) {
        name = product;
        description = desc && desc !== product ? desc : '';
      } else if (desc) {
        const lines = desc.split(/\n/);
        name = lines[0]?.trim() || '—';
        description = lines.slice(1).join('\n').trim();
      } else {
        name = '—';
        description = '';
      }
      const amount = Number(i.amount) || Number(i.quantity) * Number(i.unit_price) || 0;
      return {
        name,
        description,
        qty: String(i.quantity ?? ''),
        rate: money(Number(i.unit_price) || 0),
        amount: money(amount),
      };
    });

  return {
    companyAddressLines,
    billingAddress: q.billing_address?.trim() || customerBillingFallback(q) || '—',
    shippingAddress: q.shipping_address?.trim() || '—',
    orderNo: q.order_no?.trim() || '—',
    quotationNo: q.quote_number || '—',
    date: formatQuotationDate(q.issue_date) || '—',
    items: items.length
      ? items
      : [{ name: '—', description: '', qty: '0', rate: money(0), amount: money(0) }],
    message: q.notes?.trim() || '',
    remarks: remarksFromQuote(q),
    subtotal: money(Number(q.subtotal) || 0),
    discount: money(Number(q.discount_amount) || 0),
    total: money(Number(q.total) || 0),
    companySignName: companyAddressLines[0],
    logoSrc: '/company-logo.png',
    chopSrc: '/company-chop.png',
  };
}
