import db from './db';
import { saveReceipt, ocrImageText } from './receipt';
import { paddleOcrBoxes } from './paddle-ocr';
import { parseMeterReadingFromBoxes, parseMeterReadingFromText } from './meter-ocr';
import {
  ensureDefaultRentalUnits,
  ensureRentRecord,
  getRentalUnit,
  getSuggestedPrevElectricityReading,
  getSuggestedPrevWaterReading,
  updateRentRecordUtilities,
} from './rental-server';
import {
  UTILITY_METER_DEFINITIONS,
  UTILITY_METER_KEYS,
  isUtilityMeterKey,
  periodFromReadingDate,
  type ElectricityMeterData,
  type UtilityMeterKey,
  type UtilityMeterRound,
  type UtilityMeterRoundItem,
  type WaterMeterData,
} from './rentals';

interface RoundRow {
  id: number;
  user_id: number;
  reading_date: string;
  period: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: number;
  round_id: number;
  meter_key: string;
  reading_value: number | null;
  photo_path: string | null;
  ocr_text: string | null;
  synced_record_id: number | null;
}

type UtilityMeterItemInput = {
  meter_key: string;
  reading_value?: number | null;
  photo_path?: string | null;
  ocr_text?: string | null;
};

function hydrateItem(row: ItemRow): UtilityMeterRoundItem | null {
  if (!isUtilityMeterKey(row.meter_key)) return null;
  return {
    id: row.id,
    meter_key: row.meter_key,
    reading_value: row.reading_value != null ? Number(row.reading_value) : null,
    photo_path: row.photo_path || null,
    ocr_text: row.ocr_text || null,
    synced_record_id: row.synced_record_id != null ? Number(row.synced_record_id) : null,
  };
}

async function loadItems(roundId: number): Promise<UtilityMeterRoundItem[]> {
  const rows = (await db
    .prepare(
      'SELECT * FROM utility_meter_round_items WHERE round_id = ? ORDER BY id ASC'
    )
    .all(roundId)) as ItemRow[];
  const byKey = new Map<string, UtilityMeterRoundItem>();
  for (const row of rows) {
    const item = hydrateItem(row);
    if (item) byKey.set(item.meter_key, item);
  }
  return UTILITY_METER_KEYS.map((key) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    return {
      id: 0,
      meter_key: key,
      reading_value: null,
      photo_path: null,
      ocr_text: null,
      synced_record_id: null,
    };
  });
}

function hydrateRound(row: RoundRow, items: UtilityMeterRoundItem[]): UtilityMeterRound {
  return {
    id: row.id,
    user_id: row.user_id,
    reading_date: row.reading_date,
    period: row.period,
    notes: row.notes || '',
    items,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listUtilityMeterRounds(userId: number): Promise<UtilityMeterRound[]> {
  const rows = (await db
    .prepare(
      `SELECT * FROM utility_meter_rounds WHERE user_id = ?
       ORDER BY reading_date DESC, id DESC`
    )
    .all(userId)) as RoundRow[];
  return Promise.all(rows.map(async (row) => hydrateRound(row, await loadItems(row.id))));
}

export async function getUtilityMeterRound(
  id: number | string,
  userId: number,
): Promise<UtilityMeterRound | null> {
  const row = (await db
    .prepare('SELECT * FROM utility_meter_rounds WHERE id = ? AND user_id = ?')
    .get(id, userId)) as RoundRow | undefined;
  if (!row) return null;
  return hydrateRound(row, await loadItems(row.id));
}

async function findUnitByName(userId: number, unitName: string) {
  const row = (await db
    .prepare(
      'SELECT id FROM rental_units WHERE user_id = ? AND unit_name = ? COLLATE NOCASE'
    )
    .get(userId, unitName)) as { id: number } | undefined;
  if (!row) return null;
  return getRentalUnit(row.id, userId);
}

async function previousRoundReading(
  userId: number,
  meterKey: UtilityMeterKey,
  beforeDate: string,
): Promise<number | null> {
  const row = (await db
    .prepare(
      `SELECT i.reading_value
       FROM utility_meter_round_items i
       JOIN utility_meter_rounds r ON r.id = i.round_id
       WHERE r.user_id = ? AND i.meter_key = ? AND r.reading_date < ?
         AND i.reading_value IS NOT NULL
       ORDER BY r.reading_date DESC, r.id DESC
       LIMIT 1`
    )
    .get(userId, meterKey, beforeDate)) as { reading_value: number } | undefined;
  return row?.reading_value != null ? Number(row.reading_value) : null;
}

async function mergeElectricity(
  userId: number,
  unitName: string,
  period: string,
  patch: Partial<ElectricityMeterData>,
  fillPrevFrom?: number | null,
): Promise<number | null> {
  const unit = await findUnitByName(userId, unitName);
  if (!unit) return null;
  const record = await ensureRentRecord(unit, period);
  const existing = record.electricityMeter || {
    prevReading: null,
    currReading: null,
    ratePerUnit: null,
  };
  let prevReading = existing.prevReading;
  if ((prevReading == null || !Number.isFinite(prevReading)) && fillPrevFrom != null) {
    prevReading = fillPrevFrom;
  }
  if (prevReading == null || !Number.isFinite(prevReading)) {
    prevReading = await getSuggestedPrevElectricityReading(userId, unit.id, period);
  }
  const next: ElectricityMeterData = {
    ...existing,
    prevReading,
    ...patch,
    otherUnitUsages: patch.otherUnitUsages
      ? { ...(existing.otherUnitUsages || {}), ...patch.otherUnitUsages }
      : existing.otherUnitUsages,
    ratePerUnit: existing.ratePerUnit,
  };
  await updateRentRecordUtilities(record.id, userId, { electricityMeter: next });
  return record.id;
}

async function mergeWater(
  userId: number,
  unitName: string,
  period: string,
  currReading: number,
  fillPrevFrom?: number | null,
): Promise<number | null> {
  const unit = await findUnitByName(userId, unitName);
  if (!unit) return null;
  const record = await ensureRentRecord(unit, period);
  const existing = record.waterMeter || {
    prevReading: null,
    currReading: null,
    ratePerUnit: null,
  };
  let prevReading = existing.prevReading;
  if ((prevReading == null || !Number.isFinite(prevReading)) && fillPrevFrom != null) {
    prevReading = fillPrevFrom;
  }
  if (prevReading == null || !Number.isFinite(prevReading)) {
    prevReading = await getSuggestedPrevWaterReading(userId, unit.id, period);
  }
  const next: WaterMeterData = {
    ...existing,
    prevReading,
    currReading,
    ratePerUnit: existing.ratePerUnit,
  };
  await updateRentRecordUtilities(record.id, userId, { waterMeter: next });
  return record.id;
}

async function syncItemToBilling(
  userId: number,
  period: string,
  readingDate: string,
  meterKey: UtilityMeterKey,
  readingValue: number | null,
): Promise<number | null> {
  if (readingValue == null || !Number.isFinite(readingValue)) return null;
  const prevFromRound = await previousRoundReading(userId, meterKey, readingDate);
  const usage =
    prevFromRound != null && Number.isFinite(prevFromRound)
      ? Math.max(0, readingValue - prevFromRound)
      : null;

  switch (meterKey) {
    case 'elec_213a_main':
      return mergeElectricity(
        userId,
        '213A',
        period,
        { currReading: readingValue },
        prevFromRound,
      );
    case 'water_213a':
      return mergeWater(userId, '213A', period, readingValue, prevFromRound);
    case 'water_213b':
      return mergeWater(userId, '213B', period, readingValue, prevFromRound);
    case 'elec_213b': {
      const synced = await mergeElectricity(
        userId,
        '213B',
        period,
        { currReading: readingValue },
        prevFromRound,
      );
      if (usage != null) {
        const deduction = await findUnitByName(userId, '213B');
        await mergeElectricity(userId, '213A', period, {
          meter213B: usage,
          otherUnitUsages: deduction ? { [String(deduction.id)]: usage } : undefined,
        });
      }
      return synced;
    }
    case 'stock_room_1_2_elec': {
      const a = await mergeElectricity(
        userId,
        'Stock Room 1',
        period,
        { currReading: readingValue },
        prevFromRound,
      );
      const b = await mergeElectricity(
        userId,
        'Stock Room 2',
        period,
        { currReading: readingValue },
        prevFromRound,
      );
      if (usage != null) {
        const sr1 = await findUnitByName(userId, 'Stock Room 1');
        const sr2 = await findUnitByName(userId, 'Stock Room 2');
        const otherUnitUsages: Record<string, number | null> = {};
        if (sr1) otherUnitUsages[String(sr1.id)] = usage;
        if (sr2) otherUnitUsages[String(sr2.id)] = usage;
        await mergeElectricity(userId, '213A', period, {
          meterStockRoom1: usage,
          meterStockRoom2: usage,
          otherUnitUsages: Object.keys(otherUnitUsages).length ? otherUnitUsages : undefined,
        });
      }
      return a ?? b;
    }
    default:
      return null;
  }
}

async function upsertItemsAndSync(
  userId: number,
  roundId: number,
  readingDate: string,
  period: string,
  items: UtilityMeterItemInput[],
): Promise<void> {
  await ensureDefaultRentalUnits(userId);
  const byKey = new Map<string, UtilityMeterItemInput>();
  for (const item of items) {
    if (!isUtilityMeterKey(item.meter_key)) continue;
    byKey.set(item.meter_key, item);
  }

  for (const def of UTILITY_METER_DEFINITIONS) {
    const input = byKey.get(def.key);
    if (!input) continue;
    const reading =
      input.reading_value != null && Number.isFinite(Number(input.reading_value))
        ? Number(input.reading_value)
        : null;
    const photo = input.photo_path?.trim() || null;
    const ocr = input.ocr_text?.trim() || null;
    if (reading == null && !photo && !ocr) continue;

    const existing = (await db
      .prepare(
        'SELECT id FROM utility_meter_round_items WHERE round_id = ? AND meter_key = ?'
      )
      .get(roundId, def.key)) as { id: number } | undefined;

    let itemId = existing?.id;
    if (existing) {
      await db
        .prepare(
          `UPDATE utility_meter_round_items
           SET reading_value = ?, photo_path = COALESCE(?, photo_path), ocr_text = COALESCE(?, ocr_text),
               updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(reading, photo, ocr, existing.id);
    } else {
      const res = await db
        .prepare(
          `INSERT INTO utility_meter_round_items
            (round_id, meter_key, reading_value, photo_path, ocr_text)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(roundId, def.key, reading, photo, ocr);
      itemId = Number(res.lastInsertRowid);
    }

    try {
      const syncedId = await syncItemToBilling(userId, period, readingDate, def.key, reading);
      if (itemId && syncedId) {
        await db
          .prepare(
            `UPDATE utility_meter_round_items
             SET synced_record_id = ?, updated_at = datetime('now') WHERE id = ?`
          )
          .run(syncedId, itemId);
      }
    } catch {
      // Sync is best-effort; round items still persist.
    }
  }
}

export async function createUtilityMeterRound(
  userId: number,
  input: {
    reading_date: string;
    period?: string;
    notes?: string | null;
    items?: UtilityMeterItemInput[];
  },
): Promise<UtilityMeterRound> {
  const readingDate = (input.reading_date || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readingDate)) {
    throw new Error('reading_date is required (YYYY-MM-DD)');
  }
  const period = (input.period || '').trim() || periodFromReadingDate(readingDate);
  const notes = input.notes?.trim() || null;
  const res = await db
    .prepare(
      `INSERT INTO utility_meter_rounds (user_id, reading_date, period, notes)
       VALUES (?, ?, ?, ?)`
    )
    .run(userId, readingDate, period, notes);
  const id = Number(res.lastInsertRowid);
  await upsertItemsAndSync(userId, id, readingDate, period, input.items || []);
  const round = await getUtilityMeterRound(id, userId);
  if (!round) throw new Error('Failed to create meter round');
  return round;
}

export async function updateUtilityMeterRound(
  id: number | string,
  userId: number,
  input: {
    reading_date?: string;
    period?: string;
    notes?: string | null;
    items?: UtilityMeterItemInput[];
  },
): Promise<UtilityMeterRound | null> {
  const existing = await getUtilityMeterRound(id, userId);
  if (!existing) return null;
  const readingDate = input.reading_date
    ? input.reading_date.trim().slice(0, 10)
    : existing.reading_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readingDate)) {
    throw new Error('reading_date is required (YYYY-MM-DD)');
  }
  const period =
    (input.period || '').trim() ||
    (input.reading_date ? periodFromReadingDate(readingDate) : existing.period);
  const notes = input.notes !== undefined ? input.notes?.trim() || null : existing.notes || null;
  await db
    .prepare(
      `UPDATE utility_meter_rounds
       SET reading_date = ?, period = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .run(readingDate, period, notes, id, userId);
  if (input.items) {
    await upsertItemsAndSync(userId, Number(id), readingDate, period, input.items);
  }
  return getUtilityMeterRound(id, userId);
}

export async function deleteUtilityMeterRound(
  id: number | string,
  userId: number,
): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM utility_meter_rounds WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return (res.changes || 0) > 0;
}

export async function getUtilityMeterItemPhoto(
  itemId: number | string,
  userId: number,
): Promise<{ path: string } | null> {
  const row = (await db
    .prepare(
      `SELECT i.photo_path
       FROM utility_meter_round_items i
       JOIN utility_meter_rounds r ON r.id = i.round_id
       WHERE i.id = ? AND r.user_id = ?`
    )
    .get(itemId, userId)) as { photo_path: string | null } | undefined;
  if (!row?.photo_path) return null;
  return { path: row.photo_path };
}

async function geminiMeterReading(
  buffer: Buffer,
  mimeType: string,
): Promise<{ reading: number | null; ocr_text: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `You are reading a utility meter dial photo (water or electricity meter in Hong Kong).
Extract the numeric meter reading shown on the main digital/roller display (not the small analog sub-dials, not voltage/current ratings).
Examples of valid readings: 038429, 05731.8, 0031622, 00007, 00021.2.
Return ONLY JSON: {"reading": number|null, "raw": string|null}.
- reading: the numeric value (ignore units like kWh, m³). Preserve decimals when the last digit is tenths (red window). Use null if unreadable.
- raw: the digits as seen (keep leading zeros if visible), or null.
Do not invent values. Ignore labels like 10000/1000/100/10/1/0.1, 220V, 50Hz, imp/kWh.`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as { reading?: unknown; raw?: unknown };
    const reading =
      typeof parsed.reading === 'number' && Number.isFinite(parsed.reading)
        ? parsed.reading
        : parseMeterReadingFromText(String(parsed.raw || text));
    return { reading, ocr_text: String(parsed.raw || text || '').slice(0, 500) };
  } catch {
    return null;
  }
}

export async function ocrUtilityMeterPhoto(
  buffer: Buffer,
  mimeType: string,
  originalName = 'meter.jpg',
): Promise<{ reading: number | null; ocr_text: string; photo_path: string; source?: string }> {
  const photo_path = await saveReceipt(buffer, mimeType, originalName);

  // 1) PaddleOCR sidecar — digit clustering for roller/LCD dials
  const boxes = await paddleOcrBoxes(buffer, mimeType);
  if (boxes?.length) {
    const paddle = parseMeterReadingFromBoxes(boxes);
    if (paddle.reading != null) {
      return {
        reading: paddle.reading,
        ocr_text: (paddle.raw || String(paddle.reading)).slice(0, 500),
        photo_path,
        source: 'paddle',
      };
    }
  }

  // 2) Gemini (optional cloud)
  const gemini = await geminiMeterReading(buffer, mimeType);
  if (gemini) {
    return { ...gemini, photo_path, source: 'ai' };
  }

  // 3) tesseract.js
  const text = await ocrImageText(buffer);
  return {
    reading: parseMeterReadingFromText(text),
    ocr_text: text.slice(0, 500),
    photo_path,
    source: 'ocr',
  };
}
