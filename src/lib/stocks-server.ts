import db from './db';
import { deleteReplacedStoredFile, deleteStoredFile } from './stored-file-cleanup';
import { hkNowDateTime } from './kitchen-prep';
import { saveReceipt } from './receipt';
import type { StockItem } from './stocks';

const ICON_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_ICON_BYTES = 10 * 1024 * 1024;

interface StockRow {
  id: number;
  category: string;
  name: string;
  current_qty: number;
  safety_qty: number;
  icon_path: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function mapRow(row: StockRow): StockItem {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    current_qty: Number(row.current_qty) || 0,
    safety_qty: Number(row.safety_qty) || 0,
    icon_path: row.icon_path || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const ITEM_SELECT = `id, category, name, current_qty, safety_qty, icon_path, created_at, updated_at`;

export async function listStockItems(ownerId: number): Promise<StockItem[]> {
  const rows = (await db
    .prepare(
      `SELECT ${ITEM_SELECT}
       FROM stock_items
       WHERE user_id = ?
       ORDER BY category ASC, name ASC`
    )
    .all(ownerId)) as StockRow[];
  return rows.map(mapRow);
}

export async function getStockItem(ownerId: number, id: number): Promise<StockItem | null> {
  const row = (await db
    .prepare(
      `SELECT ${ITEM_SELECT}
       FROM stock_items WHERE user_id = ? AND id = ?`
    )
    .get(ownerId, id)) as StockRow | undefined;
  return row ? mapRow(row) : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeQty(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export async function saveStockIconFile(file: File): Promise<{ error?: string; path?: string }> {
  if (!ICON_MIMES.has(file.type)) return { error: 'Upload a PNG, JPG or WEBP image' };
  if (file.size > MAX_ICON_BYTES) return { error: 'Image too large (max 10 MB)' };
  if (file.size <= 0) return { error: 'Empty files are not allowed' };
  const buffer = Buffer.from(await file.arrayBuffer());
  const path = await saveReceipt(buffer, file.type, file.name || 'stock-icon');
  return { path };
}

export async function createStockItem(
  ownerId: number,
  input: {
    category: string;
    name: string;
    current_qty?: number;
    safety_qty?: number;
    icon_path?: string | null;
  }
): Promise<{ error?: string; item?: StockItem }> {
  const category = normalizeText(input.category);
  const name = normalizeText(input.name);
  if (!category) return { error: 'Category is required' };
  if (!name) return { error: 'Item name is required' };

  const current_qty = Math.max(0, normalizeQty(input.current_qty, 0));
  const safety_qty = Math.max(0, normalizeQty(input.safety_qty, 0));
  const icon_path = input.icon_path ? String(input.icon_path) : null;
  const now = hkNowDateTime();

  try {
    const result = await db
      .prepare(
        `INSERT INTO stock_items (user_id, category, name, current_qty, safety_qty, icon_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(ownerId, category, name, current_qty, safety_qty, icon_path, now, now);

    const id = Number(result.lastInsertRowid);
    const item = await getStockItem(ownerId, id);
    if (!item) return { error: 'Failed to create item' };
    return { item };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('UNIQUE')) {
      return { error: 'An item with this category and name already exists' };
    }
    throw err;
  }
}

export async function updateStockItem(
  ownerId: number,
  id: number,
  patch: {
    category?: string;
    name?: string;
    current_qty?: number;
    safety_qty?: number;
    icon_path?: string | null;
    clear_icon?: boolean;
  }
): Promise<{ error?: string; item?: StockItem }> {
  const existing = await getStockItem(ownerId, id);
  if (!existing) return { error: 'Item not found' };

  const category =
    patch.category !== undefined ? normalizeText(patch.category) : existing.category;
  const name = patch.name !== undefined ? normalizeText(patch.name) : existing.name;
  if (!category) return { error: 'Category is required' };
  if (!name) return { error: 'Item name is required' };

  const current_qty =
    patch.current_qty !== undefined
      ? Math.max(0, normalizeQty(patch.current_qty, existing.current_qty))
      : existing.current_qty;
  const safety_qty =
    patch.safety_qty !== undefined
      ? Math.max(0, normalizeQty(patch.safety_qty, existing.safety_qty))
      : existing.safety_qty;

  let icon_path = existing.icon_path;
  if (patch.clear_icon) icon_path = null;
  else if (patch.icon_path !== undefined) icon_path = patch.icon_path;

  try {
    await db
      .prepare(
        `UPDATE stock_items
         SET category = ?, name = ?, current_qty = ?, safety_qty = ?, icon_path = ?,
             updated_at = ?
         WHERE user_id = ? AND id = ?`
      )
      .run(category, name, current_qty, safety_qty, icon_path, hkNowDateTime(), ownerId, id);

    if (icon_path !== existing.icon_path) {
      await deleteReplacedStoredFile(existing.icon_path, icon_path);
    }

    const item = await getStockItem(ownerId, id);
    if (!item) return { error: 'Item not found' };
    return { item };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('UNIQUE')) {
      return { error: 'An item with this category and name already exists' };
    }
    throw err;
  }
}

export async function deleteStockItem(
  ownerId: number,
  id: number
): Promise<{ error?: string }> {
  const existing = await getStockItem(ownerId, id);
  if (!existing) return { error: 'Item not found' };

  const result = await db
    .prepare('DELETE FROM stock_items WHERE user_id = ? AND id = ?')
    .run(ownerId, id);
  if (!result.changes) return { error: 'Item not found' };

  await deleteStoredFile(existing.icon_path);
  return {};
}

export async function stockUp(
  ownerId: number,
  id: number,
  qty: number
): Promise<{ error?: string; item?: StockItem }> {
  const add = Number(qty);
  if (!Number.isFinite(add) || add <= 0) {
    return { error: 'Stock-up quantity must be greater than 0' };
  }

  const existing = await getStockItem(ownerId, id);
  if (!existing) return { error: 'Item not found' };

  await db
    .prepare(
      `UPDATE stock_items
       SET current_qty = current_qty + ?, updated_at = ?
       WHERE user_id = ? AND id = ?`
    )
    .run(add, hkNowDateTime(), ownerId, id);

  const item = await getStockItem(ownerId, id);
  if (!item) return { error: 'Item not found' };
  return { item };
}
