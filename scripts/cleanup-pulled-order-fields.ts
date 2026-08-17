/**
 * One-off: backfill 客人收貨日期 from Hub-pulled data, then strip stale fields_json keys
 * (especially bulky external_payload).
 *
 * Usage: npx tsx --env-file=.env.local scripts/cleanup-pulled-order-fields.ts
 */
import pg from 'pg';
import {
  getNestieeLines,
  normalizeOrderDueDate,
  parseHonourEstimateMinDate,
  parseNestieeLinesFromWoo,
  parseNestieeReceiptDateFromDeliveryOptions,
  pruneStaleOrderFields,
  type NestieeLineItem,
} from '../src/lib/orders';

function receiptFromRequestedDelivery(raw: unknown): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const min = text.split(/\s*-\s*/)[0]?.trim() || text;
  return normalizeOrderDueDate(min) || '';
}

function existingReceipt(fields: Record<string, unknown>): string {
  return (
    normalizeOrderDueDate(String(fields.due_date || '')) ||
    normalizeOrderDueDate(String(fields.client_delivery_date || '')) ||
    ''
  );
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const { rows } = await pool.query<{
    id: number;
    created_at: string;
    fields_json: string | null;
  }>('SELECT id, created_at::text AS created_at, fields_json FROM orders ORDER BY id');

  let updated = 0;
  let backfilled = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const row of rows) {
    const before = String(row.fields_json || '{}');
    bytesBefore += Buffer.byteLength(before, 'utf8');
    let fields: Record<string, unknown>;
    try {
      const parsed = JSON.parse(before || '{}');
      fields = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      fields = {};
    }

    const hadReceipt = existingReceipt(fields);
    let nextReceipt = hadReceipt;

    if (!nextReceipt) {
      const payload =
        fields.external_payload && typeof fields.external_payload === 'object'
          ? (fields.external_payload as Record<string, unknown>)
          : null;
      const platform = String(fields.order_from || '');
      const orderType = String(fields.order_type || '');

      if (platform === 'honour' || orderType.includes('honour')) {
        nextReceipt =
          parseHonourEstimateMinDate(payload) ||
          receiptFromRequestedDelivery(fields.requested_delivery);
      }

      if (!nextReceipt && (platform === 'nestiee' || orderType.includes('Nestiee'))) {
        let lines: NestieeLineItem[] = getNestieeLines(fields);
        if (!lines.length && Array.isArray(payload?.line_items)) {
          lines = parseNestieeLinesFromWoo(
            payload.line_items as Parameters<typeof parseNestieeLinesFromWoo>[0]
          );
        }
        const created =
          (typeof payload?.date_created === 'string' && payload.date_created) ||
          String(row.created_at || '');
        nextReceipt = parseNestieeReceiptDateFromDeliveryOptions(lines, created);
      }
    }

    if (nextReceipt && !hadReceipt) {
      fields.due_date = nextReceipt;
      fields.client_delivery_date = nextReceipt;
      backfilled += 1;
    }

    pruneStaleOrderFields(fields);

    const after = JSON.stringify(fields);
    bytesAfter += Buffer.byteLength(after, 'utf8');
    if (after !== before) {
      await pool.query(`UPDATE orders SET fields_json = $1, updated_at = NOW() WHERE id = $2`, [
        after,
        row.id,
      ]);
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        orders: rows.length,
        updated,
        backfilled_receipt_dates: backfilled,
        fields_json_bytes_before: bytesBefore,
        fields_json_bytes_after: bytesAfter,
        saved_bytes: bytesBefore - bytesAfter,
      },
      null,
      2
    )
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
