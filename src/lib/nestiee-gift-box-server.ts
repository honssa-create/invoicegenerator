import { getPool } from './db';
import {
  NESTIEE_ORDER_TYPE,
  nestieeGiftBoxQtyFieldsChanged,
} from './orders';

const MIGRATION_KEY = 'nestiee_gift_box_qty_from_lines_v3';

/**
 * Persist 所需禮盒 from stored `nestiee_lines` for every Nestiee order.
 * Incremental Hub sync never re-touches older Woo orders (e.g. #10609 before 20/8),
 * so dashboard / order detail stayed at 0 until this backfill.
 */
export async function migrateNestieeGiftBoxQtysOnce(): Promise<{ updated: number }> {
  const conn = await getPool().connect();
  try {
    await conn.query('BEGIN');
    await conn.query('SELECT pg_advisory_xact_lock(72910431)');

    const done = await conn.query<{ key: string }>(
      `SELECT key FROM app_migrations WHERE key = $1`,
      [MIGRATION_KEY]
    );
    if (done.rows.length) {
      await conn.query('COMMIT');
      return { updated: 0 };
    }

    const rows = await conn.query<{ id: number; fields_json: string | null }>(
      `SELECT id, fields_json
       FROM orders
       WHERE source_platform = 'nestiee'
          OR order_type = $1
          OR (
            fields_json IS NOT NULL
            AND btrim(fields_json) <> ''
            AND fields_json::jsonb->>'order_type' = $1
          )`,
      [NESTIEE_ORDER_TYPE]
    );

    let updated = 0;
    for (const row of rows.rows) {
      let fields: Record<string, unknown> = {};
      if (row.fields_json) {
        try {
          const parsed = JSON.parse(row.fields_json);
          if (!parsed || typeof parsed !== 'object') continue;
          fields = parsed as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      if (!nestieeGiftBoxQtyFieldsChanged(fields)) continue;
      await conn.query(`UPDATE orders SET fields_json = $1 WHERE id = $2`, [
        JSON.stringify(fields),
        row.id,
      ]);
      updated += 1;
    }

    await conn.query(`INSERT INTO app_migrations (key) VALUES ($1) ON CONFLICT DO NOTHING`, [
      MIGRATION_KEY,
    ]);
    await conn.query('COMMIT');
    return { updated };
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    conn.release();
  }
}
