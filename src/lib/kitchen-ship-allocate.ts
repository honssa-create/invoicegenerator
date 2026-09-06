/** Client-safe helpers for auto-allocating kitchen stock when an order is shipped. */

export type KitchenShortage = {
  label: string;
  need: number;
  have: number;
};

export type KitchenNeedStockLine = {
  needKey: string;
  remaining: number;
  label: string;
};

export type KitchenNeedStockMaps = {
  giftBoxes: Record<string, number>;
  finished: Record<string, number>;
};

/** Remaining gift-box / bottle lines that exceed on-hand stock. Empty = enough (or nothing to allocate). */
export function kitchenShortagesFromNeeds(
  remaining: KitchenNeedStockLine[],
  stock: KitchenNeedStockMaps,
): KitchenShortage[] {
  const shortages: KitchenShortage[] = [];
  for (const n of remaining) {
    const qty = Math.max(0, Math.floor(Number(n.remaining) || 0));
    if (qty <= 0) continue;
    let have = 0;
    if (n.needKey.startsWith('gift:')) {
      have = Number(stock.giftBoxes[n.needKey.slice(5)]) || 0;
    } else if (n.needKey.startsWith('bottle:')) {
      have = Number(stock.finished[n.needKey.slice(7)]) || 0;
    } else {
      continue;
    }
    if (have < qty) {
      shortages.push({ label: n.label, need: qty, have });
    }
  }
  return shortages;
}

export function parseKitchenShortageResponse(data: unknown): KitchenShortage[] | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { kitchen_shortage?: unknown; shortages?: unknown };
  if (d.kitchen_shortage !== true) return null;
  if (!Array.isArray(d.shortages)) return [];
  const out: KitchenShortage[] = [];
  for (const item of d.shortages) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { label?: unknown; need?: unknown; have?: unknown };
    out.push({
      label: typeof row.label === 'string' ? row.label : '',
      need: Number(row.need) || 0,
      have: Number(row.have) || 0,
    });
  }
  return out;
}

export function formatKitchenShortageConfirm(shortages: KitchenShortage[]): string {
  const lines = shortages.map((s) => `${s.label}: need ${s.need} / 需要 ${s.need}，have ${s.have} / 現有 ${s.have}`);
  return [
    'Kitchen stock is not enough to auto-allocate. Ship anyway without deducting?',
    '廚房庫存不足，無法自動分配。仍要設為已寄出（不扣庫存）？',
    '',
    ...lines,
  ].join('\n');
}
