import db from './db';
import {
  FINISHED_SKUS,
  RAW_MATERIALS,
  OOS_STATUS,
  READY_STATUS,
  computeBatchMaterials,
  skuOf,
  type KitchenState,
} from './kitchen';

// Seed the two-tier inventory the first time a user opens the kitchen.
export function ensureSeed(userId: number) {
  const finishedCount = (db.prepare('SELECT COUNT(*) c FROM kitchen_finished WHERE user_id = ?').get(userId) as { c: number }).c;
  if (finishedCount === 0) {
    const insF = db.prepare('INSERT OR IGNORE INTO kitchen_finished (user_id, sku, quantity) VALUES (?, ?, ?)');
    // Seed one SKU with stock so the "in-stock" path is demoable.
    const seedTx = db.transaction(() => {
      for (const sku of FINISHED_SKUS) insF.run(userId, sku, sku === skuOf('45ml', '冰糖') ? 10 : 0);
    });
    seedTx();
  }
  const rawCount = (db.prepare('SELECT COUNT(*) c FROM kitchen_raw WHERE user_id = ?').get(userId) as { c: number }).c;
  if (rawCount === 0) {
    const insR = db.prepare('INSERT OR IGNORE INTO kitchen_raw (user_id, name, unit, total_stock, allocated_stock) VALUES (?, ?, ?, ?, 0)');
    const seedTx = db.transaction(() => {
      for (const m of RAW_MATERIALS) insR.run(userId, m.name, m.unit, m.seedStock);
    });
    seedTx();
  }
}

function getFinishedQty(userId: number, sku: string): number {
  const row = db.prepare('SELECT quantity FROM kitchen_finished WHERE user_id = ? AND sku = ?').get(userId, sku) as { quantity: number } | undefined;
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO kitchen_finished (user_id, sku, quantity) VALUES (?, ?, 0)').run(userId, sku);
    return 0;
  }
  return row.quantity;
}

export function getState(userId: number): KitchenState {
  ensureSeed(userId);
  const finished = db.prepare('SELECT sku, quantity FROM kitchen_finished WHERE user_id = ? ORDER BY sku').all(userId) as KitchenState['finished'];
  const rawRows = db.prepare('SELECT name, unit, total_stock, allocated_stock FROM kitchen_raw WHERE user_id = ? ORDER BY id').all(userId) as {
    name: string; unit: string; total_stock: number; allocated_stock: number;
  }[];
  const raw = rawRows.map((r) => ({ ...r, available: Math.round((r.total_stock - r.allocated_stock) * 100) / 100 }));
  const orders = db.prepare('SELECT id, source, customer, sku, quantity, status, created_at FROM kitchen_daily_orders WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(userId) as KitchenState['orders'];
  const batchRows = db.prepare('SELECT id, flavor, capacity, brewing_date, bottle_count, status, created_at, completed_at FROM kitchen_batches WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(userId) as Omit<KitchenState['batches'][number], 'materials'>[];
  const batches = batchRows.map((b) => ({ ...b, materials: computeBatchMaterials(b.bottle_count) }));
  return { finished, raw, orders, batches };
}

// PILLAR 1 — Order routing & out-of-stock check.
export function createDailyOrder(userId: number, input: { customer?: string; sku: string; quantity: number; source?: string }) {
  ensureSeed(userId);
  const qty = Math.max(1, Math.floor(input.quantity) || 1);
  const onHand = getFinishedQty(userId, input.sku);

  let status = OOS_STATUS;
  if (onHand >= qty) {
    db.prepare('UPDATE kitchen_finished SET quantity = quantity - ? WHERE user_id = ? AND sku = ?').run(qty, userId, input.sku);
    status = READY_STATUS;
  }

  const res = db
    .prepare('INSERT INTO kitchen_daily_orders (user_id, source, customer, sku, quantity, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, input.source || 'manual', input.customer?.trim() || null, input.sku, qty, status);
  return db.prepare('SELECT * FROM kitchen_daily_orders WHERE id = ?').get(res.lastInsertRowid);
}

// PILLAR 2 — Manual batch brewing. Allocates raw materials (Allocated += required).
export function createBatch(userId: number, input: { flavor: string; capacity: string; brewing_date?: string; bottle_count: number }) {
  ensureSeed(userId);
  const bottles = Math.max(1, Math.floor(input.bottle_count) || 1);
  const required = computeBatchMaterials(bottles);

  const tx = db.transaction(() => {
    const alloc = db.prepare('UPDATE kitchen_raw SET allocated_stock = allocated_stock + ? WHERE user_id = ? AND name = ?');
    for (const m of required) alloc.run(m.qty, userId, m.name);
    const res = db
      .prepare('INSERT INTO kitchen_batches (user_id, flavor, capacity, brewing_date, bottle_count, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, input.flavor, input.capacity, input.brewing_date?.trim() || null, bottles, 'scheduled');
    return res.lastInsertRowid as number;
  });
  const id = tx();
  return db.prepare('SELECT * FROM kitchen_batches WHERE id = ?').get(id);
}

// PILLAR 2 — Complete brewing: consume raw, add finished, fulfill backlog.
export function completeBatch(userId: number, batchId: number | string) {
  ensureSeed(userId);
  const batch = db.prepare('SELECT * FROM kitchen_batches WHERE id = ? AND user_id = ?').get(batchId, userId) as
    | { id: number; flavor: string; capacity: string; bottle_count: number; status: string }
    | undefined;
  if (!batch) return { error: 'Batch not found' };
  if (batch.status === 'completed') return { error: 'Batch already completed' };

  const required = computeBatchMaterials(batch.bottle_count);
  const sku = skuOf(batch.capacity, batch.flavor);
  const fulfilled: number[] = [];

  const tx = db.transaction(() => {
    // Consume raw materials: release allocation AND deduct actual stock.
    const consume = db.prepare('UPDATE kitchen_raw SET total_stock = total_stock - ?, allocated_stock = MAX(0, allocated_stock - ?) WHERE user_id = ? AND name = ?');
    for (const m of required) consume.run(m.qty, m.qty, userId, m.name);

    // Add to finished inventory.
    getFinishedQty(userId, sku);
    db.prepare('UPDATE kitchen_finished SET quantity = quantity + ? WHERE user_id = ? AND sku = ?').run(batch.bottle_count, userId, sku);
    db.prepare("UPDATE kitchen_batches SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(batch.id);

    // Fulfill backlogged out-of-stock orders for this SKU (FIFO).
    const backlog = db.prepare("SELECT id, quantity FROM kitchen_daily_orders WHERE user_id = ? AND sku = ? AND status = ? ORDER BY created_at ASC, id ASC").all(userId, sku, OOS_STATUS) as { id: number; quantity: number }[];
    for (const o of backlog) {
      const onHand = getFinishedQty(userId, sku);
      if (onHand >= o.quantity) {
        db.prepare('UPDATE kitchen_finished SET quantity = quantity - ? WHERE user_id = ? AND sku = ?').run(o.quantity, userId, sku);
        db.prepare('UPDATE kitchen_daily_orders SET status = ? WHERE id = ?').run(READY_STATUS, o.id);
        fulfilled.push(o.id);
      }
    }
  });
  tx();
  return { ok: true, sku, added: batch.bottle_count, fulfilled };
}
