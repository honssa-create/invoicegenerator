export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected';

export interface QuotationItem {
  id: number;
  quotation_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface QuotationWithDetails {
  id: number;
  user_id: number;
  customer_id: number | null;
  quote_number: string;
  status: QuotationStatus;
  issue_date: string;
  valid_until: string | null;
  tax_rate: number;
  notes: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  items: QuotationItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
}

export const QUOTATION_STATUSES: QuotationStatus[] = ['draft', 'sent', 'approved', 'rejected'];

export const QUOTATION_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};
