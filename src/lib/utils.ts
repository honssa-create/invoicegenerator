export function calculateInvoiceTotals(
  items: { quantity: number; unit_price: number }[],
  taxRateOrOpts:
    | number
    | {
        taxRate?: number;
        discountType?: 'percent' | 'amount' | string | null;
        discountValue?: number | null;
        shippingAmount?: number | null;
      } = 0,
) {
  const opts = typeof taxRateOrOpts === 'number' ? { taxRate: taxRateOrOpts } : taxRateOrOpts || {};
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const discountType = opts.discountType === 'amount' ? 'amount' : 'percent';
  const discountValue = Number(opts.discountValue) || 0;
  const shippingAmount = Number(opts.shippingAmount) || 0;
  const discountAmount =
    discountType === 'amount'
      ? Math.min(discountValue, subtotal)
      : Math.max(0, subtotal * (discountValue / 100));
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxRate = Number(opts.taxRate) || 0;
  const taxAmount = afterDiscount * (taxRate / 100);
  const total = afterDiscount + taxAmount + shippingAmount;
  return { subtotal, discountAmount, taxAmount, total };
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
