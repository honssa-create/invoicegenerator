import {
  DEFAULT_DELIVERY_NOTE_PREVIEW,
  type DeliveryNoteLinePreview,
  type DeliveryNotePreviewModel,
} from '@/components/DeliveryNoteDocument';
import { formatCustomerPartyBlock } from '@/lib/customer-party';
import type { Order } from '@/lib/orders';
import { HONOUR_SHIPPING_LINE_STYLE, orderDueDate } from '@/lib/orders';
import { buildQuotationItemsFromOrder } from '@/lib/order-to-quotation';
import { formatQuotationDate } from '@/lib/quotation-style';
import type { InvoiceWithDetails } from '@/lib/types';

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

function invoiceDeliveryNoteItems(inv: InvoiceWithDetails): DeliveryNoteLinePreview[] {
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
      return { name, description, qty: String(i.quantity ?? '') };
    });
  return items.length ? items : [{ name: '—', description: '', qty: '—' }];
}

/** Map a saved invoice into the delivery-note print model. */
export function invoiceToDeliveryNotePreview(inv: InvoiceWithDetails): DeliveryNotePreviewModel {
  const companyAddressLines = [...DEFAULT_DELIVERY_NOTE_PREVIEW.companyAddressLines];
  const billingFallback = formatCustomerPartyBlock({
    name: inv.customer_name,
    companyName: inv.customer_company_name,
    phone: inv.customer_phone,
    email: inv.email?.trim() || inv.customer_email,
    address: inv.customer_address,
  });
  const dateSource = inv.shipping_date?.trim() || inv.issue_date;

  return {
    companyAddressLines,
    billingAddress: inv.billing_address?.trim() || billingFallback || '—',
    shippingAddress: inv.shipping_address?.trim() || '—',
    orderNo: inv.order_no?.trim() || '—',
    invoiceNo: inv.invoice_number?.trim() || '—',
    date: formatQuotationDate(dateSource) || '—',
    items: invoiceDeliveryNoteItems(inv),
    message: inv.notes?.trim() || '',
    companySignName: companyAddressLines[0],
    logoSrc: '/company-logo.png',
    chopSrc: '/company-chop.png',
  };
}
