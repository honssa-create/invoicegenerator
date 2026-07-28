export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected';
export type QuotationDiscountType = 'percent' | 'amount';

export interface QuotationItem {
  id: number;
  quotation_id: number;
  service_date: string | null;
  product_service: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  class_name: string | null;
}

export interface QuotationFile {
  id: number;
  path: string;
  original_name: string | null;
}

export interface QuotationWithDetails {
  id: number;
  user_id: number;
  customer_id: number | null;
  quote_number: string;
  status: QuotationStatus;
  issue_date: string;
  valid_until: string | null;
  tax_rate: number;
  notes: string | null;
  terms: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  email: string | null;
  send_later: boolean;
  ship_via: string | null;
  shipping_date: string | null;
  tracking_no: string | null;
  order_no: string | null;
  receipt_date: string | null;
  currency: string | null;
  discount_type: QuotationDiscountType;
  discount_value: number;
  shipping_amount: number;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  items: QuotationItem[];
  files: QuotationFile[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
}

export const QUOTATION_STATUSES: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected'];

export const QUOTATION_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

/** Status label used on the estimate-style form (draft ≈ Pending). */
export const QUOTATION_STATUS_FORM_LABEL: Record<QuotationStatus, string> = {
  draft: 'Pending',
  sent: 'Sent',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function calculateQuotationTotals(
  items: { quantity: number; unit_price: number }[],
  opts: {
    taxRate?: number;
    discountType?: QuotationDiscountType | string | null;
    discountValue?: number | null;
    shippingAmount?: number | null;
  } = {},
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discountType = opts.discountType === 'amount' ? 'amount' : 'percent';
  const discountValue = Number(opts.discountValue) || 0;
  const shippingAmount = Number(opts.shippingAmount) || 0;
  const discountAmount =
    discountType === 'amount'
      ? Math.min(discountValue, subtotal)
      : Math.max(0, subtotal * (discountValue / 100));
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxRate = Number(opts.taxRate) || 0;
  const taxAmount = afterDiscount * (taxRate / 100);
  const total = afterDiscount + taxAmount + shippingAmount;
  return { subtotal, discountAmount, taxAmount, total };
}
