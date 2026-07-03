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

export interface DashboardStats {
  totalInvoices: number;
  totalRevenue: number;
  pendingAmount: number;
  overdueCount: number;
  recentInvoices: InvoiceWithDetails[];
}
