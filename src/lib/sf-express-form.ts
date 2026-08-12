import type { Order } from '@/lib/orders';

export interface SfExpressFormState {
  orderId: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  country: string;
  cargoName: string;
  parcelQty: string;
  weightKg: string;
  payMethod: string;
  expressTypeId: string;
  remark: string;
}

export interface SfExpressSenderInfo {
  company: string;
  contact: string;
  tel: string;
  address: string;
}

function fieldStr(fields: Record<string, string | boolean>, key: string): string {
  const v = fields[key];
  if (typeof v === 'boolean') return v ? 'yes' : '';
  return String(v ?? '').trim();
}

function parcelQtyFromOrder(order: Order): string {
  const raw = order.carton_count?.trim() || '';
  const n = Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(n) && n > 0) return String(n);
  return '1';
}

function defaultOrderId(order: Order): string {
  const po = order.po_number?.trim();
  if (po) return po;
  const ref = order.reference_number?.trim();
  if (ref) return ref;
  return `ORD-${order.id}`;
}

function defaultRemark(order: Order): string {
  const time = fieldStr(order.fields, 'receiving_time');
  const date = fieldStr(order.fields, 'client_delivery_date');
  return [date ? `送貨日期: ${date}` : '', time ? `收件時間: ${time}` : '']
    .filter(Boolean)
    .join(' · ');
}

export function buildSfExpressFormDefaults(
  order: Order,
  opts?: { payMethod?: string; expressTypeId?: string }
): SfExpressFormState {
  const cargo =
    order.description?.trim() ||
    order.name?.trim() ||
    'Goods';
  return {
    orderId: defaultOrderId(order),
    recipientName: order.name?.trim() || '',
    recipientPhone: order.phone?.trim() || '',
    recipientAddress: order.shipping_address?.trim() || '',
    country: '852',
    cargoName: cargo,
    parcelQty: parcelQtyFromOrder(order),
    weightKg: '1',
    payMethod: opts?.payMethod?.trim() || '1',
    expressTypeId: opts?.expressTypeId?.trim() || '1',
    remark: defaultRemark(order),
  };
}

export function validateSfExpressForm(form: SfExpressFormState): string | null {
  if (!form.orderId.trim()) return 'Customer order ID is required.';
  if (!form.recipientName.trim()) return 'Recipient name is required.';
  if (!form.recipientPhone.trim()) return 'Recipient phone is required.';
  if (!form.recipientAddress.trim()) return 'Recipient address is required.';
  if (!form.cargoName.trim()) return 'Cargo name is required.';
  const qty = Number.parseInt(form.parcelQty, 10);
  if (!Number.isFinite(qty) || qty < 1) return 'Parcel quantity must be at least 1.';
  const weight = Number.parseFloat(form.weightKg);
  if (!Number.isFinite(weight) || weight <= 0) return 'Weight must be greater than 0.';
  return null;
}
