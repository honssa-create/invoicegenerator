/** Client-safe helpers for resolving stored image paths to display URLs. */

export function isStoredImageUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

/** Auth-scoped preview for a freshly uploaded receipt filename (before expense save). */
export function scanPreviewReceiptUrl(storedPath: string | null | undefined): string | null {
  const trimmed = storedPath?.trim();
  if (!trimmed || isStoredImageUrl(trimmed)) return null;
  const filename = trimmed.split(/[/\\]/).pop();
  if (!filename || filename !== trimmed || filename.includes('..')) return null;
  return `/api/expenses/scan-preview/${encodeURIComponent(filename)}`;
}

/**
 * Preview URL for receipts attached in the expense form (pre-save).
 * Prefer the in-browser blob from the File object — it is always immediately available.
 */
export function formReceiptPreviewUrl(
  storedPath: string,
  localBlobUrl?: string | null,
): string {
  if (localBlobUrl) return localBlobUrl;
  if (isStoredImageUrl(storedPath)) return storedPath.trim();
  return scanPreviewReceiptUrl(storedPath) || '';
}

/**
 * Display URL for a saved expense receipt.
 * Always routes through the auth-scoped API so R2/local/remote paths are streamed server-side.
 */
export function expenseReceiptUrl(
  receipt: { id: number; path: string; source_url?: string | null },
  expenseId?: number,
): string {
  if (receipt.id > 0) return `/api/receipts/${receipt.id}`;
  if (expenseId && expenseId > 0) return `/api/expenses/${expenseId}/receipt`;
  if (isStoredImageUrl(receipt.path)) return receipt.path.trim();
  return scanPreviewReceiptUrl(receipt.path) || `/api/receipts/${receipt.id}`;
}

export function orderFileUrl(file: { id: number; path: string }): string {
  if (file.id > 0) return `/api/order-files/${file.id}`;
  return isStoredImageUrl(file.path) ? file.path : `/api/order-files/${file.id}`;
}

export function orderPaymentReceiptUrl(orderId: number, storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  return `/api/orders/${orderId}/payment-receipt`;
}

export function inboundPhotoUrl(shipmentId: number, storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  return `/api/inbound-files/${shipmentId}`;
}

export function otherIncomeReceiptUrl(recordId: number, storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  return `/api/other-income/${recordId}/receipt`;
}
