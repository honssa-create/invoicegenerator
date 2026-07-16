/** Client-safe helpers for resolving stored image paths to display URLs. */

export function isStoredImageUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

export function expenseReceiptUrl(
  receipt: { id: number; path: string },
  expenseId?: number,
): string {
  if (receipt.id > 0) return `/api/receipts/${receipt.id}`;
  if (expenseId && expenseId > 0) return `/api/expenses/${expenseId}/receipt`;
  return isStoredImageUrl(receipt.path) ? receipt.path : `/api/receipts/${receipt.id}`;
}

export function orderFileUrl(file: { id: number; path: string }): string {
  return isStoredImageUrl(file.path) ? file.path : `/api/order-files/${file.id}`;
}

export function orderPaymentReceiptUrl(orderId: number, storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  return isStoredImageUrl(storedPath) ? storedPath : `/api/orders/${orderId}/payment-receipt`;
}

export function inboundPhotoUrl(shipmentId: number, storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  return isStoredImageUrl(storedPath) ? storedPath : `/api/inbound-files/${shipmentId}`;
}

export function otherIncomeReceiptUrl(recordId: number, storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  return isStoredImageUrl(storedPath) ? storedPath : `/api/other-income/${recordId}/receipt`;
}
