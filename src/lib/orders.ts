export type OrderFieldType = 'text' | 'textarea' | 'date' | 'checkbox' | 'select';

export interface OrderFieldDef {
  key: string;
  label: string;
  type: OrderFieldType;
  /** If set, this field is stored in a first-class column instead of fields_json. */
  col?: keyof CoreColumns;
  options?: string[];
  placeholder?: string;
}

export interface CoreColumns {
  po_number: string;
  name: string;
  description: string;
  status: string;
  delivery_date: string;
  customer_email: string;
  phone: string;
  shipping_address: string;
  notes: string;
}

export const ORDER_STATUSES = [
  '草稿',
  '已到公司',
  '圖稿已給客戶',
  '已搬到生產中',
  '製作中',
  '已寄出 SENT',
];

export const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-700',
  '已到公司': 'bg-blue-100 text-blue-700',
  '圖稿已給客戶': 'bg-purple-100 text-purple-700',
  '已搬到生產中': 'bg-teal-100 text-teal-700',
  '製作中': 'bg-amber-100 text-amber-700',
  '已寄出 SENT': 'bg-yellow-100 text-yellow-800',
};

// The full custom-field list shown in the order detail "Fields" panel, in order.
export const ORDER_FIELDS: OrderFieldDef[] = [
  { key: 'email', label: 'E-mail', type: 'text', col: 'customer_email', placeholder: 'name@email.com' },
  { key: 'shipping', label: 'Shipping Address (最後寄出地址)', type: 'textarea', col: 'shipping_address' },
  { key: 'phone', label: '電話', type: 'text', col: 'phone', placeholder: '+852…' },
  { key: 'po', label: 'PO#', type: 'text', col: 'po_number' },
  { key: 'qty_ordered', label: '客人下單數量 Quantity', type: 'text', placeholder: 'e.g. 4款各53個' },
  { key: 'name', label: 'Name', type: 'text', col: 'name' },
  { key: 'pack_required', label: '客戶要求交貨包裝', type: 'text', placeholder: 'e.g. OPP 獨立包裝' },
  { key: 'supplier_qty', label: '供應商生產數量', type: 'text' },
  { key: 'supplier_price', label: '供應商單價', type: 'text', placeholder: 'e.g. rmb 4.2' },
  { key: 'invoice_receipt', label: '發票及收據', type: 'text', placeholder: 'e.g. 1 Invoice, 1 Receipt' },
  { key: 'quotation_no', label: 'Quotation No. #', type: 'text' },
  { key: 'supplier_received_qty', label: '供應商到貨數量(及次數)', type: 'text' },
  { key: 'mould_print_fee', label: '供應商-模費/印刷費', type: 'text' },
  { key: 'supplier_ship_date', label: '供應商寄出日期', type: 'text', placeholder: 'e.g. 15/1/26' },
  { key: 'product_type', label: '產品/樣品', type: 'select', options: ['大貨產品', '樣品', '打樣'] },
  { key: 'plating_color', label: '電鍍色', type: 'text' },
  { key: 'clasp', label: '背扣', type: 'text', placeholder: 'e.g. 四節圓圈' },
  { key: 'craft', label: '加工工藝', type: 'text', placeholder: 'e.g. 亞加力-單面' },
  { key: 'supplier', label: '供應商', type: 'text', placeholder: 'e.g. 亞加力-和夫' },
  { key: 'supplier_pack', label: '供應商出貨包裝', type: 'text', placeholder: 'e.g. OPP獨立包裝' },
  { key: 'payment_option', label: '下單時付款選項', type: 'text', placeholder: 'e.g. yedpay' },
  { key: 'internal_pack', label: '內部包裝處理', type: 'text', placeholder: 'e.g. 不需要' },
  { key: 'all_products_check', label: '有關此訂單的，所有產品…', type: 'checkbox' },
  { key: 'invoice_before_ship', label: '出貨前要開Invoice', type: 'text' },
  { key: 'invoice_no', label: 'Invoice #', type: 'text', placeholder: 'e.g. 10013205' },
  { key: 'payment_terms', label: '款項', type: 'select', options: ['100% Payment (全數付清)', '50% 訂金', '待付款'] },
  { key: 'requested_delivery', label: '客人要求收貨日期', type: 'text', placeholder: 'e.g. 28/1/26' },
  { key: 'order_from', label: 'Order From 下單平台', type: 'text' },
  { key: 'card_size', label: '紙卡尺寸', type: 'text' },
  { key: 'tracking_no', label: 'Tracking Number 運單號', type: 'text', placeholder: 'e.g. SF5120793357800' },
  { key: 'shipping_method', label: 'Shipping 寄出方式', type: 'select', options: ['SF 順豐', '順豐', 'EMS', '香港郵政', '其他'] },
  { key: 'other_craft', label: '其他加工', type: 'text' },
];

export interface OrderFile {
  id: number;
  path: string;
  original_name: string | null;
}

export interface OrderActivity {
  id: number;
  kind: 'comment' | 'activity';
  author: string | null;
  body: string;
  created_at: string;
}

export interface Order extends CoreColumns {
  id: number;
  user_id: number;
  fields: Record<string, string | boolean>;
  files: OrderFile[];
  activities: OrderActivity[];
  created_at: string;
  updated_at: string;
}

export function orderTitle(o: Pick<CoreColumns, 'po_number' | 'name' | 'description'>): string {
  return [o.po_number, o.name, o.description].filter(Boolean).join(' - ') || 'Untitled order';
}
