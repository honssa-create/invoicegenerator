import { giftNeedKey } from '@/lib/kitchen-bom';
import { hydrateNestieeGiftBoxQtys, NESTIEE_GIFT_BOX_TYPES } from '@/lib/orders';

export type GiftBoxOrderNeed = {
  needKey: string;
  label: string;
  required: number;
  remaining: number;
};

/** Gift-box labels with qty > 0 on an order (from hydrated 所需禮盒 fields). */
export function giftBoxLabelsFromFields(fields: Record<string, unknown> | undefined | null): string[] {
  const hydrated = hydrateNestieeGiftBoxQtys({ ...(fields || {}) });
  const labels: string[] = [];
  for (const g of NESTIEE_GIFT_BOX_TYPES) {
    const qty = Number(hydrated[g.qtyKey]) || 0;
    if (qty > 0) labels.push(g.label);
  }
  return labels;
}

/** True when free-text search should match this order's gift-box labels. */
export function orderMatchesGiftBoxLabelSearch(
  fields: Record<string, unknown> | undefined | null,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = giftBoxLabelsFromFields(fields).join(' ').toLowerCase();
  return hay.includes(q);
}

export function kitchenOrderHasGiftBox(
  order: { needs: GiftBoxOrderNeed[] },
  boxType: string,
  pendingOnly = true,
): boolean {
  const need = order.needs.find((n) => n.needKey === giftNeedKey(boxType));
  if (!need) return false;
  if (pendingOnly) return need.remaining > 0;
  return need.required > 0;
}

export function sortGiftBoxDemandCards<T extends { label: string }>(boxes: T[]): T[] {
  return [...boxes].sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
}
