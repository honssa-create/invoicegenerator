/**
 * Find Nestiee orders by 所需禮盒 type (run against production DATABASE_URL).
 *
 *   DATABASE_URL=… npx tsx scripts/find-gift-box-orders.ts pink_red_date
 *   DATABASE_URL=… npx tsx scripts/find-gift-box-orders.ts --status=processing pink_red_date
 */
import { Pool } from 'pg';
import { NESTIEE_GIFT_BOX_TYPES } from '../src/lib/orders';

const args = process.argv.slice(2);
const statusArg = args.find((a) => a.startsWith('--status='));
const statusFilter = statusArg?.slice('--status='.length) || 'processing';
const boxArg = args.find((a) => !a.startsWith('--')) || 'pink_red_date';

const box = NESTIEE_GIFT_BOX_TYPES.find(
  (g) => g.id === boxArg || g.label.includes(boxArg) || g.qtyKey.includes(boxArg),
);
if (!box) {
  console.error(`Unknown gift box: ${boxArg}`);
  console.error('Known ids:', NESTIEE_GIFT_BOX_TYPES.map((g) => g.id).join(', '));
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const res = await pool.query(
    `SELECT id, po_number, reference_number, status, original_order_id,
            fields_json::jsonb->>$2 AS qty,
            fields_json::jsonb->'nestiee_lines' AS nestiee_lines
     FROM orders
     WHERE COALESCE((fields_json::jsonb->>$2)::int, 0) > 0
       AND ($1 = '' OR status = $1)
     ORDER BY id DESC`,
    [statusFilter, box.qtyKey],
  );
  await pool.end();

  console.log(`Gift box: ${box.label} (${box.id})`);
  console.log(`Status filter: ${statusFilter || '(any)'}`);
  console.log(`Matches: ${res.rowCount}`);
  for (const row of res.rows) {
    console.log('---');
    console.log(`  id: ${row.id}`);
    console.log(`  PO#: ${row.po_number || '—'}`);
    console.log(`  ref: ${row.reference_number}`);
    console.log(`  status: ${row.status}`);
    console.log(`  Woo id: ${row.original_order_id || '—'}`);
    console.log(`  qty: ${row.qty}`);
    const lines = row.nestiee_lines;
    if (Array.isArray(lines)) {
      for (const line of lines) {
        const name = String(line?.name || '');
        if (/dearest|心意即食|粉紅/i.test(name)) {
          console.log(`  line: ${name}`);
          const opts = line?.options;
          if (Array.isArray(opts)) {
            for (const o of opts) console.log(`    ${o?.label}: ${o?.value}`);
          }
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
