import {
  DEFAULT_DELIVERY_NOTE_PREVIEW,
  type DeliveryNotePreviewModel,
} from '@/components/DeliveryNoteDocument';
import type { Order } from '@/lib/orders';
import { orderDueDate } from '@/lib/orders';
import { formatQuotationDate } from '@/lib/quotation-style';

function fieldStr(fields: Record<string, string | boolean>, key: string): string {
  const v = fields[key];
  if (typeof v === 'boolean') return v ? 'yes' : '';
  return String(v ?? '').trim();
}

/** Map a saved order into the delivery-note / delivery-note-chop print model. */
export function orderToDeliveryNotePreview(order: Order): DeliveryNotePreviewModel {
  const productName = (order.description || order.name || '—').trim() || '—';
  const qty =
    fieldStr(order.fields, 'qty_ordered') ||
    fieldStr(order.fields, 'supplier_qty') ||
    '—';
  const cartonNote = order.carton_count?.trim()
    ? `Cartons / 箱數: ${order.carton_count.trim()}`
    : '';
  const tracking = fieldStr(order.fields, 'tracking_no');
  const receiptDate = orderDueDate(order);
  const descParts = [
    cartonNote,
    tracking ? `Tracking: ${tracking}` : '',
    receiptDate ? `Delivery: ${receiptDate}` : '',
  ].filter(Boolean);

  const invoiceNo =
    order.linked_invoice?.invoice_number?.trim() ||
    fieldStr(order.fields, 'invoice_no') ||
    '—';

  const orderNo = order.po_number?.trim() || order.name?.trim() || '—';

  const date =
    formatQuotationDate(receiptDate) ||
    formatQuotationDate(new Date().toISOString().slice(0, 10)) ||
    '—';

  const companyAddressLines = [...DEFAULT_DELIVERY_NOTE_PREVIEW.companyAddressLines];

  const billingAddress = order.linked_invoice?.billing_address?.trim() || '—';
  const shippingAddress = order.shipping_address?.trim() || '—';

  return {
    companyAddressLines,
    billingAddress,
    shippingAddress,
    orderNo,
    invoiceNo,
    date,
    items: [
      {
        name: productName,
        description: descParts.join('\n'),
        qty,
      },
    ],
    message: order.notes?.trim() || '',
    companySignName: companyAddressLines[0],
    logoSrc: '/company-logo.png',
    chopSrc: '/company-chop.png',
  };
}
