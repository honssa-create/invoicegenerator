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

export default function ChargeAllocationGrid({ rows, values, onChange, compact }: Props) {
  if (!rows.length) {
    return <p className="text-sm text-gray-400 py-2">No outstanding billing items.</p>;
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
