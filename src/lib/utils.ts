export function calculateInvoiceTotals(items: { quantity: number; unit_price: number }[], taxRate: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending_verification: 'bg-yellow-100 text-yellow-800',
  bank_cleared: 'bg-green-100 text-green-800',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending_verification: 'Pending Verification',
  bank_cleared: 'Bank Cleared',
};
