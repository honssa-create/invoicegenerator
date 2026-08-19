/** Client-safe types and helpers for Stocks 庫存. */

export interface StockItem {
  id: number;
  category: string;
  name: string;
  current_qty: number;
  safety_qty: number;
  created_at: string | null;
  updated_at: string | null;
}

export function isBelowSafety(item: Pick<StockItem, 'current_qty' | 'safety_qty'>): boolean {
  return Number(item.current_qty) < Number(item.safety_qty);
}

export function formatStockQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  // Avoid long floats from DOUBLE PRECISION while keeping fractional stock.
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}
