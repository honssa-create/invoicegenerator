export type UserRole = 'sales' | 'accountant';

export interface User {
  id: number;
  email: string;
  name: string;
  company_name: string | null;
  role: UserRole;
  created_at: string;
}

export type PaymentStatus = 'pending_verification' | 'bank_cleared';

export interface Payment {
  id: number;
  user_id: number;
  invoice_id: number;
  amount: number;
  payment_date: string;
  receipt_note: string | null;
  receipt_filename: string | null;
  status: PaymentStatus;
  verified_at: string | null;
  verified_by: number | null;
  locked: number;
  created_by: number;
  created_at: string;
}

export interface PaymentWithDetails extends Payment {
  invoice_number: string;
  customer_name: string;
  created_by_name: string;
  verified_by_name: string | null;
}

export type UnclaimedDepositStatus = 'unclaimed' | 'claimed';

export interface UnclaimedDeposit {
  id: number;
  user_id: number;
  deposit_date: string;
  amount: number;
  bank: string;
  remarks: string | null;
  status: UnclaimedDepositStatus;
  claimed_invoice_id: number | null;
  claimed_payment_id: number | null;
  claimed_at: string | null;
  claimed_by: number | null;
  created_by: number;
  created_at: string;
}

export interface UnclaimedDepositWithDetails extends UnclaimedDeposit {
  created_by_name: string;
  claimed_by_name: string | null;
  claimed_invoice_number: string | null;
}

export interface ReconciliationData {
  unclaimedDeposits: UnclaimedDepositWithDetails[];
  unclaimedTotal: number;
  pendingPayments: PaymentWithDetails[];
  pendingTotal: number;
  bankClearedPayments: PaymentWithDetails[];
  bankClearedTotal: number;
  pendingVerificationCount: number;
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
