'use client';

import type { ReactNode } from 'react';
import { bi } from '@/lib/ui-labels';
import { addBillingMonths, currentBillingPeriod, formatMoney } from '@/lib/rentals';

export type PaymentPeriodLine = {
  unitId?: number;
  billingPeriod: string;
  rent: string;
  electricity: string;
  water: string;
};

export function emptyPaymentPeriodLine(opts?: {
  unitId?: number;
  billingPeriod?: string;
}): PaymentPeriodLine {
  return {
    unitId: opts?.unitId,
    billingPeriod: opts?.billingPeriod || currentBillingPeriod(),
    rent: '',
    electricity: '',
    water: '',
  };
}

export function sumPaymentPeriodLine(row: PaymentPeriodLine): number {
  return Number(row.rent || 0) + Number(row.electricity || 0) + Number(row.water || 0);
}

export function sumPaymentPeriodLines(rows: PaymentPeriodLine[]): number {
  return rows.reduce((s, r) => s + sumPaymentPeriodLine(r), 0);
}

function nextPeriodAfter(rows: PaymentPeriodLine[], fallback: string): string {
  const last = rows[rows.length - 1]?.billingPeriod;
  if (last) return addBillingMonths(last, 1);
  return fallback;
}

interface UnitOption {
  id: number;
  unitName: string;
}

interface Props {
  rows: PaymentPeriodLine[];
  onChange: (rows: PaymentPeriodLine[]) => void;
  units?: UnitOption[];
  defaultUnitId?: number;
  defaultPeriod?: string;
  extraActions?: ReactNode;
}

export default function PaymentPeriodTable({
  rows,
  onChange,
  units = [],
  defaultUnitId,
  defaultPeriod,
  extraActions,
}: Props) {
  const showUnit = units.length > 1;
  const fallbackPeriod = defaultPeriod || currentBillingPeriod();
  const fallbackUnitId = defaultUnitId || units[0]?.id;

  const setLineCount = (count: number) => {
    const n = Math.max(1, Math.min(36, Math.floor(count) || 1));
    if (n === rows.length) return;
    if (n < rows.length) {
      onChange(rows.slice(0, n));
      return;
    }
    const next = [...rows];
    while (next.length < n) {
      next.push(emptyPaymentPeriodLine({
        unitId: fallbackUnitId,
        billingPeriod: nextPeriodAfter(next, fallbackPeriod),
      }));
    }
    onChange(next);
  };

  const updateRow = (idx: number, patch: Partial<PaymentPeriodLine>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    onChange([
      ...rows,
      emptyPaymentPeriodLine({
        unitId: fallbackUnitId,
        billingPeriod: nextPeriodAfter(rows, fallbackPeriod),
      }),
    ]);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) {
      onChange([emptyPaymentPeriodLine({ unitId: fallbackUnitId, billingPeriod: fallbackPeriod })]);
      return;
    }
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <label className="text-xs font-semibold text-gray-600 uppercase">
          {bi('Period lines', '帳期明細')}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            {bi('Lines', '列數')}
            <input
              type="number"
              min={1}
              max={36}
              className="w-14 text-xs border rounded px-1.5 py-1 text-right"
              value={rows.length}
              aria-label={bi('Number of period lines', '帳期列數')}
              onChange={(e) => setLineCount(Number(e.target.value))}
            />
          </label>
          <button type="button" className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={addRow}>
            + {bi('Row', '列')}
          </button>
        </div>
      </div>
      <div className="border rounded-lg overflow-x-auto">
        <table className={`w-full text-sm ${showUnit ? 'min-w-[42rem]' : 'min-w-[36rem]'}`}>
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              {showUnit && <th className="px-3 py-2 text-left">{bi('Unit', '單位')}</th>}
              <th className="px-3 py-2 text-left">{bi('Period', '帳期')}</th>
              <th className="px-3 py-2 text-right">{bi('Rent', '租金')}</th>
              <th className="px-3 py-2 text-right">{bi('Electricity', '電費')}</th>
              <th className="px-3 py-2 text-right">{bi('Water', '水費')}</th>
              <th className="px-3 py-2 text-right">{bi('Line total', '小計')}</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <tr key={idx}>
                {showUnit && (
                  <td className="px-3 py-2">
                    <select
                      className="w-full text-xs border rounded px-1 py-1"
                      value={row.unitId || ''}
                      onChange={(e) => updateRow(idx, { unitId: Number(e.target.value) })}
                      aria-label={bi('Unit', '單位')}
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.unitName}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="px-3 py-2">
                  <input
                    type="month"
                    className="w-full text-xs border rounded px-2 py-1"
                    value={row.billingPeriod}
                    onChange={(e) => updateRow(idx, { billingPeriod: e.target.value })}
                    aria-label={bi('Period', '帳期')}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-full text-xs border rounded px-2 py-1 text-right"
                    value={row.rent}
                    onChange={(e) => updateRow(idx, { rent: e.target.value })}
                    aria-label={bi('Rent', '租金')}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-full text-xs border rounded px-2 py-1 text-right"
                    value={row.electricity}
                    onChange={(e) => updateRow(idx, { electricity: e.target.value })}
                    aria-label={bi('Electricity', '電費')}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    className="w-full text-xs border rounded px-2 py-1 text-right"
                    value={row.water}
                    onChange={(e) => updateRow(idx, { water: e.target.value })}
                    aria-label={bi('Water', '水費')}
                  />
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gray-700 whitespace-nowrap">
                  {formatMoney(sumPaymentPeriodLine(row))}
                </td>
                <td className="px-1 py-2">
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600 text-xs"
                    aria-label={bi('Remove row', '刪除列')}
                    onClick={() => removeRow(idx)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {bi('Each line is one billing period with rent, electricity and water.', '每列為一個帳期，含租金、電費及水費。')}
      </p>
    </div>
  );
}
