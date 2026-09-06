'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DateSelectSheet from '@/components/DateSelectSheet';
import {
  NESTIEE_DATE_FILTER_TYPES,
  NESTIEE_SHIPPING_BOX_SLOTS,
  shippingBoxDisplayLabel,
  type NestieeDateFilterType,
  type NestieeUsedShippingBoxesSummary,
} from '@/lib/nestiee-order-demand';
import { localDateYmd } from '@/lib/orders';
import { tapProps } from '@/lib/tap-action';
import { FILTER, bi } from '@/lib/ui-labels';

const DATE_FILTER_LABELS: Record<NestieeDateFilterType, { en: string; zh: string }> = {
  order_date: { en: 'By order date', zh: '落下單日期' },
  delivery_date: { en: 'By delivery date', zh: '按送貨日期' },
};

type ShippingInventoryRow = {
  boxId: string;
  label: string;
  quantity: number;
  needed: number;
};

function monthStartYmd(): string {
  const today = localDateYmd();
  return `${today.slice(0, 8)}01`;
}

function UsedDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fieldCls =
    'w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm text-left focus:ring-2 focus:ring-brand-500 outline-none';
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] font-medium text-gray-500 mb-1">{label}</span>
      <button
        type="button"
        className={`${fieldCls} ${value ? 'text-gray-900' : 'text-gray-400'}`}
        {...tapProps(() => setOpen(true))}
      >
        {value || bi('Any date', '不限日期')}
      </button>
      {open && (
        <DateSelectSheet
          title={label}
          value={value}
          onApply={(ymd) => {
            onChange(ymd);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function shortfallClass(shortfall: number): string {
  return shortfall > 0 ? 'text-red-600 font-semibold' : 'text-green-600';
}

export default function KitchenUsedShippingBoxes() {
  const [dateStart, setDateStart] = useState(monthStartYmd);
  const [dateEnd, setDateEnd] = useState(localDateYmd);
  const [dateFilterType, setDateFilterType] = useState<NestieeDateFilterType>('order_date');
  const [summary, setSummary] = useState<NestieeUsedShippingBoxesSummary | null>(null);
  const [shippingInventory, setShippingInventory] = useState<ShippingInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    params.set('dateFilterType', dateFilterType);
    fetch(`/api/kitchen/used-shipping-boxes?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.summary) setSummary(d.summary);
        if (Array.isArray(d?.shippingInventory)) setShippingInventory(d.shippingInventory);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setLoading(false));
  }, [dateStart, dateEnd, dateFilterType]);

  useEffect(() => {
    load();
  }, [load]);

  const inventoryById = useMemo(() => {
    const map = new Map<string, ShippingInventoryRow>();
    for (const row of shippingInventory) map.set(row.boxId, row);
    return map;
  }, [shippingInventory]);

  const rows = NESTIEE_SHIPPING_BOX_SLOTS.map((slot) => {
    const used = summary?.shippingBoxes.find((b) => b.id === slot.id)?.qty ?? 0;
    const inv = inventoryById.get(slot.id);
    const stock = inv?.quantity ?? 0;
    const needed = inv?.needed ?? 0;
    const shortfall = Math.max(0, needed - stock);
    return {
      id: slot.id,
      label: shippingBoxDisplayLabel(slot),
      stock,
      needed,
      shortfall,
      used,
    };
  });

  const totalStock = rows.reduce((sum, r) => sum + r.stock, 0);
  const totalNeeded = rows.reduce((sum, r) => sum + r.needed, 0);
  const totalShortfall = rows.reduce((sum, r) => sum + r.shortfall, 0);
  const totalUsed = rows.reduce((sum, r) => sum + r.used, 0);

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-5 flex flex-col">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">已用物流箱統計 (燕窩訂單)</h2>
          <p className="text-sm text-gray-500 mt-1">
            {bi(
              'Used = shipped/completed in date range · Need = processing orders · Stock = on hand.',
              '已用 = 日期範圍內已出貨／已完成 · 需要 = 處理中訂單 · 庫存 = 現有數量。',
            )}
          </p>
        </div>
        <p className="text-xs text-gray-500 shrink-0">
          {loading
            ? bi('Loading…', '載入中…')
            : bi(
                `${summary?.orderCount ?? 0} shipped order(s) in range`,
                `日期範圍內 ${summary?.orderCount ?? 0} 張已出貨訂單`,
              )}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 mb-4">
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <UsedDateField label={FILTER.startDate} value={dateStart} onChange={setDateStart} />
          <UsedDateField label={FILTER.endDate} value={dateEnd} onChange={setDateEnd} />
        </div>
        <div
          className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm self-start"
          role="group"
          aria-label={bi('Date filter basis', '日期篩選基準')}
        >
          {NESTIEE_DATE_FILTER_TYPES.map((option) => {
            const active = dateFilterType === option;
            const label = DATE_FILTER_LABELS[option];
            return (
              <button
                key={option}
                type="button"
                className={`min-h-[44px] px-3 py-2 rounded-md transition-colors font-medium ${
                  active
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                {...tapProps(() => setDateFilterType(option))}
              >
                {bi(label.en, label.zh)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="min-h-[44px] px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
          {...tapProps(() => {
            setDateStart('');
            setDateEnd('');
          })}
        >
          {bi('Clear dates', '清除日期')}
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        {bi('Date filter applies to used counts only.', '日期篩選只影響「已用」欄。')}
      </p>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">{bi('Box type', '箱型')}</th>
              <th className="py-2 pr-2 text-right">{bi('Stock', '庫存')}</th>
              <th className="py-2 pr-2 text-right">{bi('Need', '需要')}</th>
              <th className="py-2 pr-2 text-right">{bi('Shortfall', '尚欠')}</th>
              <th className="py-2 text-right">{bi('Used (est.)', '已用')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50">
                <td className="py-2 pr-2">{row.label}</td>
                <td className="py-2 pr-2 text-right font-medium tabular-nums">
                  {loading ? '—' : row.stock}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {loading ? '—' : row.needed}
                </td>
                <td
                  className={`py-2 pr-2 text-right tabular-nums ${loading ? '' : shortfallClass(row.shortfall)}`}
                >
                  {loading ? '—' : row.shortfall}
                </td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {loading ? '—' : row.used}
                </td>
              </tr>
            ))}
            <tr className="font-semibold text-gray-900 border-t border-gray-200">
              <td className="py-2 pr-2">{bi('Total', '合計')}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{loading ? '—' : totalStock}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{loading ? '—' : totalNeeded}</td>
              <td
                className={`py-2 pr-2 text-right tabular-nums ${loading ? '' : shortfallClass(totalShortfall)}`}
              >
                {loading ? '—' : totalShortfall}
              </td>
              <td className="py-2 text-right tabular-nums">{loading ? '—' : totalUsed}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        {bi(
          'Need counts processing Nestiee orders. Shortfall = Need − Stock. Adjust stock under Inventory → Boxes.',
          '「需要」為處理中燕窩訂單所需外箱；尚欠 = 需要 − 庫存。庫存可在「庫存 → Boxes 紙箱」設定。',
        )}
      </p>

      {!loading && (summary?.orderCount ?? 0) === 0 && (
        <p className="text-sm text-gray-500 mt-2">
          {bi(
            'No shipped/completed Nestiee orders in this date range.',
            '此日期範圍內沒有已出貨／已完成的燕窩訂單。',
          )}
        </p>
      )}
    </div>
  );
}
