import {
  DEFAULT_QUOTATION_PREVIEW,
  type QuotationPreviewModel,
} from '@/components/FormalQuotationDocument';
import type { InvoiceWithDetails } from '@/lib/types';
import { formatQuotationDate, formatQuotationMoney } from '@/lib/quotation-style';

export interface InvoicePrintBusiness {
  name: string;
  company_name: string | null;
  email: string;
}

/** Default payment block from public/invoice-template.html (Invoice No. substituted). */
export function defaultInvoicePaymentRemarks(invoiceNo: string): string {
  return `We accept both cheque payment and bank transfer
(Please remark the Invoice No: ${invoiceNo} on the cheque or in the bank transfer note.)
-
Crossed cheque made payable to “Honour Label Limited”
And mail to above address
-
Bank transfer detail:
374-279610-001
HONOUR LABEL LIMITED
HANG SENG BANK (bank code : 024)
-`;
}

function customerBillingFallback(inv: InvoiceWithDetails): string {
  return [
    inv.customer_name,
    inv.customer_address,
    [inv.customer_city, inv.customer_state, inv.customer_zip].filter(Boolean).join(', '),
    inv.customer_email,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Map a saved invoice into the Honour Label formal print/preview model. */
export function invoiceToFormalPreview(
  inv: InvoiceWithDetails,
  _business?: InvoicePrintBusiness | null,
): QuotationPreviewModel {
  const currency = inv.currency || 'HKD';
  const money = (n: number) => formatQuotationMoney(n, currency);
  const invoiceNo = inv.invoice_number || '—';

  const companyAddressLines = [...DEFAULT_QUOTATION_PREVIEW.companyAddressLines];

  const items = (inv.items || [])
    .filter((i) => String(i.description || i.product_service || '').trim())
    .map((i) => {
      const product = (i.product_service || '').trim();
      const desc = (i.description || '').trim();
      const name = product || desc || '—';
      const description = product && desc && desc !== product ? desc : '';
      const amount = Number(i.amount) || Number(i.quantity) * Number(i.unit_price) || 0;
      return {
        name,
        description,
        qty: String(i.quantity ?? ''),
        rate: money(Number(i.unit_price) || 0),
        amount: money(amount),
      };
    });

  const paymentRemarks = defaultInvoicePaymentRemarks(invoiceNo);

  return {
    companyAddressLines,
    billingAddress: inv.billing_address?.trim() || customerBillingFallback(inv) || '—',
    shippingAddress: inv.shipping_address?.trim() || '—',
    orderNo: inv.order_no?.trim() || '—',
    quotationNo: invoiceNo,
    date: formatQuotationDate(inv.issue_date) || '—',
    items: items.length
      ? items
      : [{ name: '—', description: '', qty: '0', rate: money(0), amount: money(0) }],
    message: inv.notes?.trim() || '',
    remarks: [paymentRemarks],
    subtotal: money(Number(inv.subtotal) || 0),
    discount: money(Number(inv.discount_amount) || 0),
    total: money(Number(inv.total) || 0),
    companySignName: companyAddressLines[0],
    logoSrc: '/company-logo.png',
    chopSrc: '/company-chop.png',
  };
}
