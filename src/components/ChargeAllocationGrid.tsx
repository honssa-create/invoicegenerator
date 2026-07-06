'use client';

import {
  CHARGE_STATUS_LABELS,
  CHARGE_TYPE_LABELS,
  chargeOutstanding,
  formatMoney,
  type RentalChargeItem,
  type RentalChargeItemStatus,
  type RentalChargeType,
} from '@/lib/rentals';

export interface ChargeAllocationRow {
  key: string;
  label: string;
  sublabel?: string;
  chargeItemId?: number;
  chargeType?: RentalChargeType;
  amountDue: number;
  amountAllocated: number;
  status?: RentalChargeItemStatus;
}

interface Props {
  rows: ChargeAllocationRow[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  compact?: boolean;
  /** Simpler 3-row layout for rent / water / electricity only */
  threeRow?: boolean;
}

export function chargeRowsFromItems(
  items: RentalChargeItem[],
  unitNames: Record<number, string>,
): ChargeAllocationRow[] {
  return items.map((c) => ({
    key: String(c.id),
    label: `${unitNames[c.unitId] || `Unit ${c.unitId}`} · ${c.billingPeriod}`,
    sublabel: CHARGE_TYPE_LABELS[c.chargeType],
    chargeItemId: c.id,
    chargeType: c.chargeType,
    amountDue: c.amountDue,
    amountAllocated: c.amountAllocated,
    status: c.status,
  }));
}

export function chargeRowsFromRecord(
  items: { chargeType: RentalChargeType; amountDue: number; amountAllocated: number; status?: RentalChargeItemStatus }[],
): ChargeAllocationRow[] {
  return items.map((c) => ({
    key: c.chargeType,
    label: CHARGE_TYPE_LABELS[c.chargeType],
    chargeType: c.chargeType,
    amountDue: c.amountDue,
    amountAllocated: c.amountAllocated,
    status: c.status,
  }));
}

const CHARGE_TYPE_ORDER: RentalChargeType[] = ['rent', 'water', 'electricity'];

/** Aggregate outstanding charges into exactly 3 rows (rent / water / electricity). */
export function chargeRowsByType(items: RentalChargeItem[]): ChargeAllocationRow[] {
  const totals: Record<RentalChargeType, { due: number; allocated: number }> = {
    rent: { due: 0, allocated: 0 },
    water: { due: 0, allocated: 0 },
    electricity: { due: 0, allocated: 0 },
  };
  for (const item of items) {
    const bucket = totals[item.chargeType];
    bucket.due += item.amountDue || 0;
    bucket.allocated += item.amountAllocated || 0;
  }
  return CHARGE_TYPE_ORDER.map((chargeType) => ({
    key: chargeType,
    label: CHARGE_TYPE_LABELS[chargeType],
    chargeType,
    amountDue: totals[chargeType].due,
    amountAllocated: totals[chargeType].allocated,
  })).filter((r) => r.amountDue > 0 || chargeOutstanding(r) > 0);
}

/** Spread rent/water/electricity amounts across billing items (FIFO by period, then unit). */
export function distributeByChargeType(
  items: RentalChargeItem[],
  values: Record<string, string>,
): { chargeItemId: number; amount: number }[] {
  const result: { chargeItemId: number; amount: number }[] = [];
  for (const chargeType of CHARGE_TYPE_ORDER) {
    let remaining = Number(values[chargeType] || 0);
    if (remaining <= 0) continue;
    const sorted = items
      .filter((c) => c.chargeType === chargeType && chargeOutstanding(c) > 0)
      .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod) || a.unitId - b.unitId);
    for (const item of sorted) {
      if (remaining <= 0.009) break;
      const out = chargeOutstanding(item);
      const alloc = Math.min(remaining, out);
      if (alloc > 0.009) {
        result.push({ chargeItemId: item.id, amount: Math.round(alloc * 100) / 100 });
        remaining -= alloc;
      }
    }
  }
  return result;
}

export function sumAllocationValues(values: Record<string, string>): number {
  return Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);
}

export function fillOutstandingValues(rows: ChargeAllocationRow[]): Record<string, string> {
  const init: Record<string, string> = {};
  for (const row of rows) {
    const out = chargeOutstanding(row);
    init[row.key] = out > 0 ? String(out) : '';
  }
  return init;
}

export function fillRentOnlyValues(rows: ChargeAllocationRow[]): Record<string, string> {
  const init: Record<string, string> = {};
  for (const row of rows) {
    const out = chargeOutstanding(row);
    if (row.chargeType === 'rent' && out > 0) init[row.key] = String(out);
    else init[row.key] = '';
  }
  return init;
}

const STATUS_BADGE: Record<RentalChargeItemStatus, string> = {
  empty: 'text-gray-400',
  unpaid: 'text-red-700 bg-red-50',
  partially_paid: 'text-orange-700 bg-orange-50',
  paid: 'text-green-700 bg-green-50',
};

export default function ChargeAllocationGrid({ rows, values, onChange, compact, threeRow }: Props) {
  if (!rows.length) {
    return <p className="text-sm text-gray-400 py-2">No outstanding billing items.</p>;
  }

  if (threeRow) {
    return (
      <div className={`space-y-3 ${compact ? 'text-xs' : 'text-sm'}`}>
        {rows.map((row) => {
          const outstanding = chargeOutstanding(row);
          const status = row.status || (outstanding <= 0 ? 'paid' : row.amountAllocated > 0 ? 'partially_paid' : 'unpaid');
          return (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-gray-900">{row.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  應繳 Due {row.amountDue > 0 ? formatMoney(row.amountDue) : '—'}
                  {' · '}
                  未付 Outstanding <span className="font-semibold text-red-700">{outstanding > 0 ? formatMoney(outstanding) : '—'}</span>
                </p>
                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_BADGE[status]}`}>
                  {CHARGE_STATUS_LABELS[status]}
                </span>
              </div>
              <label className="text-xs text-gray-500 sm:hidden">本次收款</label>
              <input
                type="number"
                min={0}
                step="0.01"
                max={outstanding}
                disabled={outstanding <= 0}
                className="w-full sm:w-32 px-3 py-2 border border-gray-200 rounded-lg text-right font-semibold disabled:bg-gray-100 disabled:text-gray-400"
                placeholder="0"
                value={values[row.key] || ''}
                onChange={(e) => onChange({ ...values, [row.key]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`border border-gray-200 rounded-xl overflow-hidden ${compact ? 'text-xs' : 'text-sm'}`}>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 font-semibold">
        <span>收費項目 Item</span>
        <span className="text-right">應繳 Due</span>
        <span className="text-right">未付 Out.</span>
        <span className="text-right w-24">本次分配</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
        {rows.map((row) => {
          const outstanding = chargeOutstanding(row);
          if (outstanding <= 0 && row.amountDue <= 0) return null;
          const status = row.status || (outstanding <= 0 ? 'paid' : row.amountAllocated > 0 ? 'partially_paid' : 'unpaid');
          return (
            <div key={row.key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2.5 items-center">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{row.label}</p>
                {row.sublabel && <p className="text-xs text-gray-500">{row.sublabel}</p>}
                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_BADGE[status]}`}>
                  {CHARGE_STATUS_LABELS[status]}
                </span>
              </div>
              <span className="text-right text-gray-600">{row.amountDue > 0 ? formatMoney(row.amountDue) : '—'}</span>
              <span className="text-right font-semibold text-red-700">{outstanding > 0 ? formatMoney(outstanding) : '—'}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                max={outstanding}
                disabled={outstanding <= 0}
                className="w-24 px-2 py-1 border border-gray-200 rounded text-right disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="0"
                value={values[row.key] || ''}
                onChange={(e) => onChange({ ...values, [row.key]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
