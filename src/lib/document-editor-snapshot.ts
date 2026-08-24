export type DocumentLineItem = {
  service_date: string;
  product_service: string;
  description: string;
  quantity: number;
  unit_price: number;
};

type SharedDocumentFields = {
  customerId: string;
  email: string;
  sendLater: boolean;
  issueDate: string;
  taxRate: number;
  status: string;
  notes: string;
  terms: string;
  billingAddress: string;
  shippingAddress: string;
  shipVia: string;
  shippingDate: string;
  trackingNo: string;
  orderNo: string;
  receiptDate: string;
  currency: string;
  discountType: string;
  discountValue: number;
  shippingAmount: number;
  items: DocumentLineItem[];
};

function filterLineItems(items: DocumentLineItem[]) {
  return items.filter((item) => item.description.trim() || item.product_service.trim());
}

export function buildInvoiceEditorSnapshot(
  fields: SharedDocumentFields & { dueDate: string; term: string },
): string {
  return JSON.stringify({
    ...fields,
    items: filterLineItems(fields.items),
  });
}

export function buildQuotationEditorSnapshot(
  fields: SharedDocumentFields & { validUntil: string },
): string {
  return JSON.stringify({
    ...fields,
    items: filterLineItems(fields.items),
  });
}

export function invoiceSnapshotFromRecord(inv: {
  customer_id?: number | null;
  email?: string | null;
  customer_email?: string | null;
  send_later?: boolean | null;
  issue_date: string;
  due_date: string;
  term?: string | null;
  tax_rate: number;
  status: string;
  notes?: string | null;
  terms?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  ship_via?: string | null;
  shipping_date?: string | null;
  tracking_no?: string | null;
  order_no?: string | null;
  receipt_date?: string | null;
  currency?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  shipping_amount?: number | null;
  items: Array<{
    service_date?: string | null;
    product_service?: string | null;
    description?: string | null;
    quantity: number;
    unit_price: number;
  }>;
}): string {
  return buildInvoiceEditorSnapshot({
    customerId: inv.customer_id ? String(inv.customer_id) : '',
    email: inv.email || inv.customer_email || '',
    sendLater: Boolean(inv.send_later),
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    term: inv.term || 'NET30',
    taxRate: inv.tax_rate,
    status: inv.status,
    notes: inv.notes || '',
    terms: inv.terms || '',
    billingAddress: inv.billing_address || '',
    shippingAddress: inv.shipping_address || '',
    shipVia: inv.ship_via || '',
    shippingDate: inv.shipping_date || '',
    trackingNo: inv.tracking_no || '',
    orderNo: inv.order_no || '',
    receiptDate: inv.receipt_date || '',
    currency: inv.currency || 'HKD',
    discountType: inv.discount_type || 'percent',
    discountValue: inv.discount_value || 0,
    shippingAmount: inv.shipping_amount || 0,
    items: inv.items.length
      ? inv.items.map((item) => ({
          service_date: item.service_date || '',
          product_service: item.product_service || '',
          description: item.description || '',
          quantity: item.quantity,
          unit_price: item.unit_price,
        }))
      : [{ service_date: '', product_service: '', description: '', quantity: 1, unit_price: 0 }],
  });
}

export function quotationSnapshotFromRecord(q: {
  customer_id?: number | null;
  email?: string | null;
  customer_email?: string | null;
  send_later?: boolean | null;
  issue_date: string;
  valid_until?: string | null;
  tax_rate: number;
  status: string;
  notes?: string | null;
  terms?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  ship_via?: string | null;
  shipping_date?: string | null;
  tracking_no?: string | null;
  order_no?: string | null;
  receipt_date?: string | null;
  currency?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
  shipping_amount?: number | null;
  items: Array<{
    service_date?: string | null;
    product_service?: string | null;
    description?: string | null;
    quantity: number;
    unit_price: number;
  }>;
}): string {
  return buildQuotationEditorSnapshot({
    customerId: q.customer_id ? String(q.customer_id) : '',
    email: q.email || q.customer_email || '',
    sendLater: Boolean(q.send_later),
    issueDate: q.issue_date,
    validUntil: q.valid_until || '',
    taxRate: q.tax_rate,
    status: q.status,
    notes: q.notes || '',
    terms: q.terms || '',
    billingAddress: q.billing_address || '',
    shippingAddress: q.shipping_address || '',
    shipVia: q.ship_via || '',
    shippingDate: q.shipping_date || '',
    trackingNo: q.tracking_no || '',
    orderNo: q.order_no || '',
    receiptDate: q.receipt_date || '',
    currency: q.currency || 'HKD',
    discountType: q.discount_type || 'percent',
    discountValue: q.discount_value || 0,
    shippingAmount: q.shipping_amount || 0,
    items: q.items.length
      ? q.items.map((item) => ({
          service_date: item.service_date || '',
          product_service: item.product_service || '',
          description: item.description || '',
          quantity: item.quantity,
          unit_price: item.unit_price,
        }))
      : [{ service_date: '', product_service: '', description: '', quantity: 1, unit_price: 0 }],
  });
}
