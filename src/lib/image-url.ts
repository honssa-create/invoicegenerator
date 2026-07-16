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
 * Prefer the in-browser blob from the File object — it is always immediately available,
 * unlike a freshly uploaded R2 URL which may not be public yet.
 */
export function formReceiptPreviewUrl(
  storedPath: string,
  localBlobUrl?: string | null,
): string {
  if (localBlobUrl) return localBlobUrl;
  if (isStoredImageUrl(storedPath)) return storedPath.trim();
  return scanPreviewReceiptUrl(storedPath) || '';
}

export function expenseReceiptUrl(
  receipt: { id: number; path: string; source_url?: string | null },
  expenseId?: number,
): string {
  // R2 / imported external links are stored as public URLs — use them directly so
  // <img> previews work without an auth-scoped API redirect hop.
  if (isStoredImageUrl(receipt.path)) return receipt.path.trim();
  if (receipt.source_url && isStoredImageUrl(receipt.source_url)) return receipt.source_url.trim();
  if (receipt.id > 0) return `/api/receipts/${receipt.id}`;
  if (expenseId && expenseId > 0) return `/api/expenses/${expenseId}/receipt`;
  return `/api/receipts/${receipt.id}`;
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
