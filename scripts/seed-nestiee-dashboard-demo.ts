/**
 * Set 所需禮盒 qty fields on a few processing Nestiee orders for dashboard demo.
 *
 * Usage:
 *   DATABASE_URL=postgresql://… npx tsx scripts/seed-nestiee-dashboard-demo.ts
 */
import db, { getPool } from '../src/lib/db';
import { NESTIEE_ORDER_TYPE } from '../src/lib/orders';

const DEMO_GIFT_QTYS: Record<number, Record<string, number>> = {
  7: {
    nestiee_gift_qty_star_gold: 2,
    nestiee_gift_qty_qiu_yan_fei_yue: 1,
  },
  8: {
    nestiee_gift_qty_star_silver: 1,
    nestiee_gift_qty_trial_set: 3,
    nestiee_gift_qty_rou_run_share_box: 1,
  },
  32: {
    nestiee_gift_qty_pink_osmanthus: 2,
    nestiee_gift_qty_pink_red_date: 1,
  },
  37: {
    nestiee_gift_qty_red_gold: 1,
    nestiee_gift_qty_red_silver: 2,
  },
};

async function main() {
  let updated = 0;
  for (const [idRaw, giftQtys] of Object.entries(DEMO_GIFT_QTYS)) {
    const id = Number(idRaw);
    const row = (await db
      .prepare('SELECT id, reference_number, status, order_type, fields_json FROM orders WHERE id = ?')
      .get(id)) as
      | {
          id: number;
          reference_number: string;
          status: string;
          order_type: string | null;
          fields_json: string | null;
        }
      | undefined;

    if (!row) {
      console.warn(`Skip id=${id}: order not found`);
      continue;
    }
    if (row.order_type !== NESTIEE_ORDER_TYPE || row.status !== 'processing') {
      console.warn(`Skip ${row.reference_number}: expected processing Nestiee order`);
      continue;
    }

    let fields: Record<string, unknown> = {};
    try {
      fields = row.fields_json ? JSON.parse(row.fields_json) : {};
    } catch {
      fields = {};
    }

    for (const [key, qty] of Object.entries(giftQtys)) {
      fields[key] = String(qty);
    }
    fields.order_type = NESTIEE_ORDER_TYPE;

    await db
      .prepare(
        `UPDATE orders
         SET fields_json = ?, status = 'processing', order_type = ?, updated_at = to_char(NOW() AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI:SS')
         WHERE id = ?`
      )
      .run(JSON.stringify(fields), NESTIEE_ORDER_TYPE, id);

    console.log(`Updated ${row.reference_number} (id=${id})`, giftQtys);
    updated += 1;
  }

  console.log(`Done — updated ${updated} processing Nestiee order(s).`);
  console.log('Open /orders?type=nestiee to view the production dashboard.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPool().end();
    } catch {
      /* ignore */
    }
  });
