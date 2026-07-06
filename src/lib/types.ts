export interface User {
  id: number;
  email: string;
  name: string;
  company_name: string | null;
  created_at: string;
}

export interface Customer {
  id: number;
  user_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
  id: number;
  user_id: number;
  customer_id: number;
  order_id: number | null;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  tax_rate: number;
  notes: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkedOrderSummary {
  id: number;
  po_number: string | null;
  name: string | null;
  description: string | null;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface InvoiceWithDetails extends Invoice {
  customer_name: string;
  customer_email: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  items: InvoiceItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
}

export type PaymentStatus = 'unpaid' | 'pending' | 'paid';

export interface ExpenseReceipt {
  id: number;
  path: string;
}

export interface Expense {
  id: number;
  user_id: number;
  created_by_user_id?: number | null;
  receipt_no: string | null;
  category: string;
  merchant: string | null;
  amount_hkd: number | null;
  amount_rmb: number | null;
  paid_date: string | null;
  order_no: string | null;
  platform: string | null;
  payment_method: string | null;
  notes: string | null;
  payment_status: PaymentStatus;
  receipt_path: string | null;
  receipts: ExpenseReceipt[];
  created_at: string;
  updated_at: string;
}

export interface ReceiptScanResult {
  merchant: string | null;
  date: string | null;
  amount_hkd: number | null;
  amount_rmb: number | null;
  receipt_path: string | null;
  raw_text: string;
  source: 'ai' | 'ocr';
}

export interface DashboardStats {
  totalInvoices: number;
  totalRevenue: number;
  pendingAmount: number;
  overdueCount: number;
  recentInvoices: InvoiceWithDetails[];
}
