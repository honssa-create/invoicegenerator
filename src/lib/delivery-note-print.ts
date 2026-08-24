import {
  DEFAULT_DELIVERY_NOTE_PREVIEW,
  type DeliveryNoteLinePreview,
  type DeliveryNotePreviewModel,
} from '@/components/DeliveryNoteDocument';
import type { Order } from '@/lib/orders';
import { HONOUR_SHIPPING_LINE_STYLE, orderDueDate } from '@/lib/orders';
import { buildQuotationItemsFromOrder } from '@/lib/order-to-quotation';
import { formatQuotationDate } from '@/lib/quotation-style';

function fieldStr(fields: Record<string, string | boolean>, key: string): string {
  const v = fields[key];
  if (typeof v === 'boolean') return v ? 'yes' : '';
  return String(v ?? '').trim();
}

function buildDeliveryNoteItems(order: Order): DeliveryNoteLinePreview[] {
  const shippingStyle = HONOUR_SHIPPING_LINE_STYLE.toLowerCase();
  const drafts = buildQuotationItemsFromOrder(order).filter(
    (item) => item.product_service.trim().toLowerCase() !== shippingStyle,
  );

  if (drafts.length) {
    return drafts.map((item) => ({
      name: item.product_service,
      description: item.description,
      qty: String(item.quantity),
    }));
  }

  return [
    {
      name: (order.description || order.name || '—').trim() || '—',
      description: '',
      qty:
        fieldStr(order.fields, 'qty_ordered') ||
        fieldStr(order.fields, 'supplier_qty') ||
        '—',
    },
  ];
}

/** Map a saved order into the delivery-note / delivery-note-chop print model. */
export function orderToDeliveryNotePreview(order: Order): DeliveryNotePreviewModel {
  const receiptDate = orderDueDate(order);

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
    items: buildDeliveryNoteItems(order),
    message: order.notes?.trim() || '',
    companySignName: companyAddressLines[0],
    logoSrc: '/company-logo.png',
    chopSrc: '/company-chop.png',
  };
}
