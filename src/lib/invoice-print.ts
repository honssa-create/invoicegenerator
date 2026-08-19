import {
  DEFAULT_QUOTATION_PREVIEW,
  type QuotationPreviewModel,
} from '@/components/FormalQuotationDocument';
import {
  DEFAULT_DEPOSIT_INVOICE_PREVIEW,
  type DepositInvoicePreviewModel,
} from '@/components/DepositInvoiceDocument';
import {
  DEFAULT_BALANCE_INVOICE_PREVIEW,
  type BalanceInvoicePreviewModel,
} from '@/components/BalanceInvoiceDocument';
import type { InvoiceWithDetails } from '@/lib/types';
import { computeOrderPaidTotal } from '@/lib/orders';
import { formatQuotationDate, formatQuotationMoney } from '@/lib/quotation-style';

export interface InvoicePrintBusiness {
  name: string;
  company_name: string | null;
  email: string;
}

/** Default payment block for invoice print (Invoice No. substituted). */
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

/** Thank-you block for paid-invoice receipt print. */
export function defaultReceiptPaymentRemarks(): string {
  return 'Thank you for your payment.';
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

function invoiceLineItems(inv: InvoiceWithDetails, money: (n: number) => string) {
  const items = (inv.items || [])
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
  return items.length
    ? items
    : [{ name: '—', description: '', qty: '0', rate: money(0), amount: money(0) }];
}

function resolveHalfOrOverride(
  total: number,
  money: (n: number) => string,
  override?: string | number,
): string {
  if (typeof override === 'string') return override;
  if (typeof override === 'number') return money(override);
  return money(total / 2);
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
  const paymentRemarks = defaultInvoicePaymentRemarks(invoiceNo);

  return {
    companyAddressLines,
    billingAddress: inv.billing_address?.trim() || customerBillingFallback(inv) || '—',
    shippingAddress: inv.shipping_address?.trim() || '—',
    orderNo: inv.order_no?.trim() || '—',
    quotationNo: invoiceNo,
    date: formatQuotationDate(inv.issue_date) || '—',
    items: invoiceLineItems(inv, money),
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

/** Map a paid invoice into the standard formal layout with receipt remarks. */
export function invoiceToReceiptPreview(
  inv: InvoiceWithDetails,
  business?: InvoicePrintBusiness | null,
): QuotationPreviewModel {
  return {
    ...invoiceToFormalPreview(inv, business),
    remarks: [defaultReceiptPaymentRemarks()],
  };
}

export interface DepositInvoicePrintOptions {
  /** Formatted deposit amount; defaults to half of total when omitted. */
  depositDue?: string | number;
}

/** Map a saved invoice into the deposit-invoice-template.html print model. */
export function invoiceToDepositPreview(
  inv: InvoiceWithDetails,
  _business?: InvoicePrintBusiness | null,
  options?: DepositInvoicePrintOptions,
): DepositInvoicePreviewModel {
  const currency = inv.currency || 'HKD';
  const money = (n: number) => formatQuotationMoney(n, currency);
  const invoiceNo = inv.invoice_number || '—';
  const companyAddressLines = [...DEFAULT_DEPOSIT_INVOICE_PREVIEW.companyAddressLines];
  const total = Number(inv.total) || 0;

  return {
    companyAddressLines,
    billingAddress: inv.billing_address?.trim() || customerBillingFallback(inv) || '—',
    shippingAddress: inv.shipping_address?.trim() || '—',
    orderNo: inv.order_no?.trim() || '—',
    invoiceNo,
    paymentTerms: inv.terms?.trim() || inv.term?.trim() || '—',
    date: formatQuotationDate(inv.issue_date) || '—',
    items: invoiceLineItems(inv, money),
    message: inv.notes?.trim() || '',
    paymentRemarks: defaultInvoicePaymentRemarks(invoiceNo),
    subtotal: money(Number(inv.subtotal) || 0),
    discount: money(Number(inv.discount_amount) || 0),
    total: money(total),
    depositDue: resolveHalfOrOverride(total, money, options?.depositDue),
    companySignName: companyAddressLines[0],
    logoSrc: '/company-logo.png',
    chopSrc: '/company-chop.png',
  };
}

export interface BalanceInvoicePrintOptions {
  /** Explicit balance override (wins over order-linked / half-total defaults). */
  balanceDue?: string | number;
  /**
   * Linked order payment fields. When present (and no explicit balanceDue),
   * balance = max(0, invoice total − sum of installment payments).
   */
  orderFields?: Record<string, string | boolean> | null;
}

/** Remaining unpaid for a balance invoice: total − order payments, floored at 0. */
export function computeBalanceDueAmount(
  invoiceTotal: number,
  orderFields?: Record<string, string | boolean> | null,
): number {
  const total = Number(invoiceTotal) || 0;
  if (!orderFields) return Math.round((total / 2) * 100) / 100;
  const paid = computeOrderPaidTotal(orderFields);
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

function resolveBalanceDue(
  total: number,
  money: (n: number) => string,
  options?: BalanceInvoicePrintOptions,
): string {
  if (typeof options?.balanceDue === 'string') return options.balanceDue;
  if (typeof options?.balanceDue === 'number') return money(options.balanceDue);
  return money(computeBalanceDueAmount(total, options?.orderFields));
}

/** Map a saved invoice into the balance-invoice-template.html print model. */
export function invoiceToBalancePreview(
  inv: InvoiceWithDetails,
  _business?: InvoicePrintBusiness | null,
  options?: BalanceInvoicePrintOptions,
): BalanceInvoicePreviewModel {
  const currency = inv.currency || 'HKD';
  const money = (n: number) => formatQuotationMoney(n, currency);
  const invoiceNo = inv.invoice_number || '—';
  const companyAddressLines = [...DEFAULT_BALANCE_INVOICE_PREVIEW.companyAddressLines];
  const total = Number(inv.total) || 0;

  return {
    companyAddressLines,
    billingAddress: inv.billing_address?.trim() || customerBillingFallback(inv) || '—',
    shippingAddress: inv.shipping_address?.trim() || '—',
    orderNo: inv.order_no?.trim() || '—',
    invoiceNo,
    paymentTerms: inv.terms?.trim() || inv.term?.trim() || '—',
    date: formatQuotationDate(inv.issue_date) || '—',
    items: invoiceLineItems(inv, money),
    message: inv.notes?.trim() || '',
    paymentRemarks: defaultInvoicePaymentRemarks(invoiceNo),
    subtotal: money(Number(inv.subtotal) || 0),
    discount: money(Number(inv.discount_amount) || 0),
    total: money(total),
    balanceDue: resolveBalanceDue(total, money, options),
    companySignName: companyAddressLines[0],
    logoSrc: '/company-logo.png',
    chopSrc: '/company-chop.png',
  };
}
