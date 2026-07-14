export const TRASH_RETENTION_DAYS = 60;

export type TrashEntityType =
  | 'expense'
  | 'invoice'
  | 'customer'
  | 'order'
  | 'quotation'
  | 'other_income'
  | 'inbound'
  | 'kitchen_prep'
  | 'order_file';

export const TRASH_ENTITY_LABELS: Record<TrashEntityType, string> = {
  expense: 'Expense 支出',
  invoice: 'Invoice 發票',
  customer: 'Customer 客戶',
  order: 'Order 訂單',
  quotation: 'Quotation 報價單',
  other_income: 'Other Income 其他收入',
  inbound: 'Inbound Shipment 到件',
  kitchen_prep: 'Kitchen Prep 備料單',
  order_file: 'Order Design Proof 設計圖',
};

export interface TrashListItem {
  id: number;
  entity_type: TrashEntityType;
  entity_id: number;
  label: string;
  summary: string | null;
  deleted_at: string;
  expires_at: string;
  days_remaining: number;
  can_restore: boolean;
}
